import { observable, action } from "mobx"
import { serialize, deserialize } from "serializr"

import Song, { emptySong } from "common/song"
import TrackMute from "common/trackMute"

import Router from "./Router"
import HistoryStore from "./HistoryStore"
import SettingsStore from "./SettingsStore"
import RootViewStore from "./RootViewStore"
import PianoRollStore from "./PianoRollStore"
import ArrangeViewStore from "./ArrangeViewStore"
import TempoEditorStore from "./TempoEditorStore"

import Player from "common/player"
import Quantizer from "common/quantizer"
import SynthOutput from "services/SynthOutput"
import { TIME_BASE } from "../Constants"

export interface Services {
  player: Player
  quantizer: Quantizer
  synth: SynthOutput
}

// we use any for now. related: https://github.com/Microsoft/TypeScript/issues/1897
type Json = any

export default class RootStore {
  @observable.ref song: Song = emptySong()
  router = new Router()
  trackMute = new TrackMute()
  historyStore = new HistoryStore<Song>()
  settingsStore = new SettingsStore()
  rootViewStore = new RootViewStore()
  pianoRollStore: PianoRollStore
  arrangeViewStore = new ArrangeViewStore()
  tempoEditorStore = new TempoEditorStore()

  services: Services

  constructor() {
    const synth = new SynthOutput("A320U.sf2")
    const player = new Player(TIME_BASE, synth, this.trackMute)
    const quantizer = new Quantizer(TIME_BASE)
    this.services = { player, quantizer, synth }
    this.pianoRollStore = new PianoRollStore()

    synth.onLoadSoundFont = (e) => {
      this.pianoRollStore.presetNames = e.presetNames
      player.reset()
    }
  }

  private serializeUndoableState = (): Json => {
    return serialize(this.song)
  }

  private restoreState = (serializedState: Json) => {
    const song = deserialize(Song, serializedState)
    song.onDeserialized()
    this.song = song
  }

  pushHistory = () => {
    const state = this.serializeUndoableState()
    this.historyStore.push(state)
  }

  undo = () => {
    const currentState = this.serializeUndoableState()
    const nextState = this.historyStore.undo(currentState)
    if (nextState !== undefined) {
      this.restoreState(nextState)
    }
  }

  redo = () => {
    const currentState = this.serializeUndoableState()
    const nextState = this.historyStore.redo(currentState)
    if (nextState !== undefined) {
      this.restoreState(nextState)
    }
  }
}
