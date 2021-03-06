import { observable, action, transaction } from "mobx"
import { serializable, list } from "serializr"
import isEqual from "lodash/isEqual"
import without from "lodash/without"
import difference from "lodash/difference"
import sortBy from "lodash/sortBy"
import last from "lodash/last"
import { AnyEvent } from "midifile-ts"

import { getInstrumentName } from "midi/GM"
import {
  TrackEvent,
  TrackEventRequired,
  TrackMidiEvent,
  NoteEvent,
} from "./TrackEvent"
import { isNotUndefined } from "../helpers/array"
import {
  isTrackNameEvent,
  isProgramChangeEvent,
  isEndOfTrackEvent,
  isSetTempoEvent,
  isControllerEvent,
  isTimeSignatureEvent,
} from "./identify"
import { pojo } from "../helpers/pojo"

type EventBeforeAdded = TrackMidiEvent | Omit<NoteEvent, "id">

export default class Track {
  @serializable(list(pojo))
  @observable.shallow
  events: TrackEvent[] = []

  @serializable
  @observable
  lastEventId = 0

  @serializable
  @observable
  channel: number | undefined = undefined

  getEventById = (id: number) => this.events.find((e) => e.id === id)

  private _updateEvent(
    id: number,
    obj: Partial<TrackEvent>
  ): TrackEvent | null {
    const index = this.events.findIndex((e) => e.id === id)
    if (index < 0) {
      console.warn(`unknown id: ${id}`)
      return null
    }
    const anObj = this.events[index]
    const newObj = { ...anObj, ...obj }
    if (isEqual(newObj, anObj)) {
      return null
    }
    this.events[index] = newObj as TrackEvent
    return anObj
  }

  @action updateEvent(id: number, obj: Partial<TrackEvent>): TrackEvent | null {
    const result = this._updateEvent(id, obj)
    if (result) {
      this.updateEndOfTrack()
      this.sortByTick()
    }
    return result
  }

  @action updateEvents(events: Partial<TrackEvent>[]) {
    transaction(() => {
      events.forEach((event) => {
        if (event.id === undefined) {
          return
        }
        this._updateEvent(event.id, event)
      })
    })
    this.updateEndOfTrack()
    this.sortByTick()
  }

  @action removeEvent(id: number) {
    const obj = this.getEventById(id)
    if (obj == undefined) {
      return
    }
    this.events = without(this.events, obj)
    this.updateEndOfTrack()
  }

  @action removeEvents(ids: number[]) {
    const objs = ids.map((id) => this.getEventById(id)).filter(isNotUndefined)
    this.events = difference(this.events, objs)
    this.updateEndOfTrack()
  }

  // ソート、通知を行わない内部用の addEvent
  private _addEvent(e: EventBeforeAdded): TrackEvent {
    if (!("tick" in e) || isNaN(e.tick)) {
      throw new Error("invalid event is added")
    }
    const newEvent = {
      ...e,
      id: this.lastEventId++,
    } as TrackEvent
    this.events.push(newEvent)
    return newEvent
  }

  @action addEvent<T extends EventBeforeAdded>(e: T): TrackEvent {
    const ev = this._addEvent(e)
    this.didAddEvent()
    return ev
  }

  @action addEvents(events: EventBeforeAdded[]): TrackEvent[] {
    let result: TrackEvent[] = []
    transaction(() => {
      result = events.map((e) => this._addEvent(e))
    })
    this.didAddEvent()
    return result
  }

  didAddEvent() {
    this.updateEndOfTrack()
    this.sortByTick()
  }

  @action sortByTick() {
    this.events = sortBy(this.events, "tick")
  }

  @action updateEndOfTrack() {
    const tick = Math.max(
      ...this.events.map((e) => e.tick + ("duration" in e ? e.duration : 0))
    )
    this.setEndOfTrack(tick)
  }

  transaction(func: (track: Track) => void) {
    transaction(() => func(this))
  }

  /* helper */

  private _findControllerEvents(controllerType: number) {
    return this.events
      .filter(isControllerEvent)
      .filter((t) => t.controllerType === controllerType)
  }

  private _updateLast<T extends AnyEvent | TrackEventRequired>(
    arr: TrackEvent[],
    obj: Partial<T>
  ) {
    const lastEvent = last(arr)
    if (lastEvent !== undefined) {
      this.updateEvent(lastEvent.id, obj)
    }
  }

  createOrUpdate(newEvent: Partial<TrackEvent>) {
    const events = this.events.filter(
      (e) =>
        e.type === newEvent.type &&
        e.tick === newEvent.tick &&
        ("subtype" in e && "subtype" in newEvent
          ? e.subtype === newEvent.subtype
          : true)
    )

    if (events.length > 0) {
      this.transaction((it) => {
        events.forEach((e) => {
          it.updateEvent(e.id, { ...newEvent, id: e.id })
        })
      })
      return events[0]
    } else {
      return this.addEvent(newEvent as EventBeforeAdded)
    }
  }

  // 表示用の名前 トラック名がなければトラック番号を表示する
  get displayName() {
    if (this.name && this.name.length > 0) {
      return this.name
    }
    return `Track ${this.channel}`
  }

  get instrumentName() {
    if (this.isRhythmTrack) {
      return "Standard Drum Kit"
    }
    const program = this.programNumber
    if (program !== undefined) {
      return getInstrumentName(program)
    }
    return undefined
  }

  get name(): string | undefined {
    return last(this.events.filter(isTrackNameEvent))?.text
  }

  setName(text: string) {
    this._updateLast(this.events.filter(isTrackNameEvent), { text })
  }

  private getControllerValue = (controllerType: number, tick: number) =>
    getLastEventBefore(this._findControllerEvents(controllerType), tick)?.value

  private setControllerValue = (
    controllerType: number,
    tick: number,
    value: number
  ) => {
    const e = getLastEventBefore(
      this._findControllerEvents(controllerType),
      tick
    )
    if (e !== undefined) {
      this.updateEvent(e.id, {
        value,
      })
    } else {
      // If there are no controller events, we insert new event at the head of the track
      this.addEvent({
        type: "channel",
        subtype: "controller",
        controllerType,
        tick: 0,
        value,
      })
    }
  }

  getVolume = (tick: number) => this.getControllerValue(7, tick)
  setVolume = (value: number, tick: number) =>
    this.setControllerValue(7, tick, value)

  getPan = (tick: number) => this.getControllerValue(10, tick)
  setPan = (value: number, tick: number) =>
    this.setControllerValue(10, tick, value)

  get endOfTrack(): number | undefined {
    return last(this.events.filter(isEndOfTrackEvent))?.tick
  }

  setEndOfTrack(tick: number) {
    this._updateLast(this.events.filter(isEndOfTrackEvent), { tick })
  }

  get programNumber(): number | undefined {
    return last(this.events.filter(isProgramChangeEvent))?.value
  }

  setProgramNumber = (value: number) =>
    this._updateLast(this.events.filter(isProgramChangeEvent), { value })

  getTempoEvent = (tick: number) =>
    getLastEventBefore(this.events.filter(isSetTempoEvent), tick)

  getTimeSignatureEvent = (tick: number) =>
    getLastEventBefore(this.events.filter(isTimeSignatureEvent), tick)

  getTempo(tick: number): number | undefined {
    const e = this.getTempoEvent(tick)
    if (e === undefined) {
      return undefined
    }
    return 60000000 / e.microsecondsPerBeat
  }

  setTempo(bpm: number, tick: number) {
    const microsecondsPerBeat = 60000000 / bpm
    const e = this.getTempoEvent(tick)
    if (e !== undefined) {
      this.updateEvent(e.id, {
        microsecondsPerBeat,
      })
    }
  }

  get isConductorTrack() {
    return this.channel === undefined
  }

  get isRhythmTrack() {
    return this.channel === 9
  }
}

const getLastEventBefore = <T extends TrackEvent>(
  events: T[],
  tick: number
): T | undefined => {
  return last(
    events
      .slice()
      .filter((e) => e.tick <= tick)
      .sort((e) => e.tick)
  )
}
