import React, { Component } from "react"
import { observer, inject } from "mobx-react"
import sizeMe from "react-sizeme"

import PianoGrid from "containers/PianoRollEditor/PianoRoll/PianoGrid"
import PianoRuler from "containers/PianoRollEditor/PianoRoll/PianoRuler"
import PianoCursor from "containers/PianoRollEditor/PianoRoll/PianoCursor"
import PianoSelection from "containers/PianoRollEditor/PianoRoll/PianoSelection"

import Stage from "components/Stage/Stage"
import { VerticalScrollBar, HorizontalScrollBar, BAR_WIDTH } from "components/inputs/ScrollBar"
import NavigationBar from "components/groups/NavigationBar"

import NoteCoordTransform from "model/NoteCoordTransform"

import mapBeats from "helpers/mapBeats"
import { pointSub, pointAdd } from "helpers/point"
import filterEventsWithScroll from "helpers/filterEventsWithScroll"

import ArrangeNoteItem from "./ArrangeNoteItem"
import ArrangeToolbar from "./ArrangeToolbar"

import "./ArrangeView.css"

function NavItem({ title, onClick }) {
  return <div className="NavItem" onClick={onClick}>{title}</div>
}

function ArrangeTrack({
  events,
  transform,
  width,
  isDrumMode,
  scrollLeft
}) {
  const t = transform
  const items = events
    .filter(e => e.subtype === "note")
    .map(e => new ArrangeNoteItem(e.id, t.getRect(e), isDrumMode))

  return <Stage
    className="ArrangeTrack"
    items={items}
    width={width}
    height={Math.ceil(t.pixelsPerKey * t.numberOfKeys)}
    scrollLeft={scrollLeft}
  />
}

function TrackHeader({
  track: t,
  height,
  onClick
}) {
  const name = t.displayName || `Track ${t.channel}`
  const instrument = t.instrumentName

  return <div className="TrackHeader" style={{ height }} onClick={onClick}>
    <div className="name">{name}</div>
    <div className="instrument">{instrument}</div>
  </div>
}

function ArrangeView({
  tracks,
  theme,
  beats,
  endTick,
  playerPosition,
  transform,
  selection,
  startSelection,
  resizeSelection,
  endSelection,
  scrollLeft = 0,
  scrollTop = 0,
  onScrollLeft,
  onScrollTop,
  onSelectTrack,
  dispatch,
  size,
  loop,
  pushSettings
}) {
  scrollLeft = Math.floor(scrollLeft)

  const { pixelsPerTick } = transform

  const containerWidth = size.width
  const containerHeight = size.height

  const startTick = scrollLeft / pixelsPerTick
  const widthTick = Math.max(endTick, transform.getTicks(containerWidth))
  const contentWidth = widthTick * pixelsPerTick
  const mappedBeats = mapBeats(beats, pixelsPerTick, startTick, widthTick)

  const bottomBorderWidth = 1
  const trackHeight = Math.ceil(transform.pixelsPerKey * transform.numberOfKeys) + bottomBorderWidth
  const contentHeight = trackHeight * tracks.length

  const selectionRect = selection && {
    x: transform.getX(selection.x) - scrollLeft,
    width: transform.getX(selection.width),
    y: selection.y * trackHeight - scrollTop,
    height: selection.height * trackHeight
  }

  function setScrollLeft(scroll) {
    const maxOffset = Math.max(0, contentWidth - containerWidth)
    onScrollLeft({ scroll: Math.floor(Math.min(maxOffset, Math.max(0, scroll))) })
  }

  function setScrollTop(scroll) {
    const maxOffset = Math.max(0, contentHeight - containerHeight)
    onScrollTop({ scroll: Math.floor(Math.min(maxOffset, Math.max(0, scroll))) })
  }

  function handleLeftClick(e, createPoint) {
    const startPos = createPoint(e.nativeEvent)
    const isSelectionSelected = selection != null && selection.containsPoint(startPos)

    const createSelectionHandler = (e, mouseMove, mouseUp) => {
      dispatch("ARRANGE_START_SELECTION", startPos)
      mouseMove(e => {
        dispatch("ARRANGE_RESIZE_SELECTION", { start: startPos, end: createPoint(e) })
      })
      mouseUp(e => {
        dispatch("ARRANGE_END_SELECTION", { start: startPos, end: createPoint(e) })
      })
    }

    const dragSelectionHandler = (e, mouseMove, mouseUp) => {
      const startSelection = { ...selection }
      mouseMove(e => {
        const delta = pointSub(createPoint(e), startPos)
        const pos = pointAdd(startSelection, delta)
        dispatch("ARRANGE_MOVE_SELECTION", pos)
      })
      mouseUp(e => { })
    }

    let handler

    if (isSelectionSelected) {
      handler = dragSelectionHandler
    } else {
      handler = createSelectionHandler
    }

    let mouseMove, mouseUp
    handler(e, fn => mouseMove = fn, fn => mouseUp = fn)

    function onMouseMove(e) {
      mouseMove(e)
    }

    function onMouseUp(e) {
      mouseUp(e)
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  function handleMiddleClick(e) {
    function createPoint(e) {
      return { x: e.clientX, y: e.clientY }
    }
    const startPos = createPoint(e.nativeEvent)

    function onMouseMove(e) {
      const pos = createPoint(e)
      const delta = pointSub(pos, startPos)
      setScrollLeft(Math.max(0, scrollLeft - delta.x))
      setScrollTop(Math.max(0, scrollTop - delta.y))
    }

    function onMouseUp(e) {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }

  function handleRightClick(e, createPoint) {
    const startPos = createPoint(e.nativeEvent)
    const isSelectionSelected = selection != null && selection.containsPoint(startPos)
    dispatch("ARRANGE_OPEN_CONTEXT_MENU", {
      position: { x: e.pageX, y: e.pageY },
      isSelectionSelected
    })
  }

  function onMouseDown(e) {
    const { left, top } = e.currentTarget.getBoundingClientRect()

    function createPoint(e) {
      const x = e.pageX - left + scrollLeft
      const y = e.pageY - top - theme.rulerHeight + scrollTop
      const tick = transform.getTicks(x)
      return { x: tick, y: y / trackHeight }
    }

    switch (e.button) {
      case 0:
        handleLeftClick(e, createPoint)
        break
      case 1:
        handleMiddleClick(e)
        break
      case 2:
        handleRightClick(e, createPoint)
        break
      default:
        break
    }
  }

  function onWheel(e) {
    e.preventDefault()
    const scrollLineHeight = trackHeight
    const delta = scrollLineHeight * (e.deltaY > 0 ? 1 : -1)
    setScrollTop(scrollTop + delta)
  }

  return <div
    className="ArrangeView"
  >
    <NavigationBar title="Arrange">
      <div className="menu">
        <NavItem title="settings" onClick={pushSettings} />
      </div>
    </NavigationBar>
    <ArrangeToolbar />
    <div className="alpha">
      <div className="left">
        <div className="left-top-space" />
        <div className="headers" style={{ top: -scrollTop }}>
          {tracks.map((t, i) =>
            <TrackHeader track={t} height={trackHeight} key={i} onClick={() => onSelectTrack(i)} />
          )}
        </div>
      </div>
      <div
        className="right"
        onMouseDown={onMouseDown}
        onContextMenu={e => e.preventDefault()}
        onWheel={onWheel}>
        <PianoRuler
          width={containerWidth}
          theme={theme}
          height={theme.rulerHeight}
          endTick={widthTick}
          beats={mappedBeats}
          scrollLeft={scrollLeft}
          pixelsPerTick={pixelsPerTick}
          onMouseDown={({ tick }) => dispatch("SET_PLAYER_POSITION", { tick })}
          loop={loop}
        />
        <div
          className="content"
          style={{ top: -scrollTop }}>
          <div className="tracks">
            {tracks.map((t, i) =>
              <ArrangeTrack
                width={containerWidth}
                events={filterEventsWithScroll(t.events, pixelsPerTick, scrollLeft, containerWidth)}
                transform={transform}
                key={i}
                scrollLeft={scrollLeft}
                isDrumMode={t.isRhythmTrack}
              />
            )}
          </div>
          <PianoGrid
            theme={theme}
            width={containerWidth}
            height={contentHeight}
            scrollLeft={scrollLeft}
            beats={mappedBeats}
          />
          <PianoSelection
            width={containerWidth}
            height={contentHeight}
            color="black"
            selectionBounds={selectionRect}
            hidden={selection == null}
          />
          <PianoCursor
            width={containerWidth}
            height={contentHeight}
            position={transform.getX(playerPosition) - scrollLeft}
          />
        </div>
        <div style={{ width: `calc(100% - ${BAR_WIDTH}px)`, position: "absolute", bottom: 0 }}>
          <HorizontalScrollBar
            scrollOffset={scrollLeft}
            contentLength={contentWidth}
            onScroll={onScrollLeft}
          />
        </div>
      </div>
      <div style={{
        height: `calc(100% - ${BAR_WIDTH}px)`,
        position: "absolute",
        top: 0,
        right: 0
      }}>
        <VerticalScrollBar
          scrollOffset={scrollTop}
          contentLength={contentHeight}
          onScroll={onScrollTop}
        />
      </div>
      <div className="scroll-corner" />
    </div>
  </div>
}

function stateful(WrappedComponent) {
  return class extends Component {
    componentDidMount() {
      this.props.player.on("change-position", this.updatePosition)
    }

    componentWillUnmount() {
      this.props.player.off("change-position", this.updatePosition)
    }

    get transform() {
      return new NoteCoordTransform(
        this.props.pixelsPerTick,
        this.props.keyHeight,
        127)
    }

    updatePosition = (tick) => {
      this.setState({
        playerPosition: tick
      })

      const { autoScroll, size } = this.props

      // keep scroll position to cursor
      if (autoScroll) {
        const transform = this.transform
        const x = transform.getX(tick)
        const screenX = x - this.props.scrollLeft
        if (screenX > size.width * 0.7 || screenX < 0) {
          this.props.setScrollLeft(x)
        }
      }
    }

    render() {
      const { setScrollLeft, setScrollTop } = this.props

      return <WrappedComponent
        onScrollLeft={({ scroll }) => setScrollLeft(scroll)}
        onScrollTop={({ scroll }) => setScrollTop(scroll)}
        transform={this.transform}
        {...this.state}
        {...this.props}
      />
    }
  }
}

const mapStoreToProps = ({ rootStore: {
  rootViewStore: { theme },
  song: { tracks, measureList, endOfSong },
  arrangeViewStore: s,
  services: { player, quantizer },
  playerStore: { loop },
  router,
  dispatch
} }) => ({
    theme,
    tracks,
    beats: measureList.beats,
    endTick: endOfSong,
    keyHeight: 0.3,
    pixelsPerTick: 0.1 * s.scaleX,
    autoScroll: s.autoScroll,
    scrollLeft: s.scrollLeft,
    setScrollLeft: v => s.scrollLeft = v,
    scrollTop: s.scrollTop,
    setScrollTop: v => s.scrollTop = v,
    player,
    quantizer,
    selection: s.selection,
    dispatch,
    onSelectTrack: trackId => {
      router.pushTrack()
      dispatch("SELECT_TRACK", { trackId })
    },
    pushSettings: () => router.pushSettings(),
    loop
  })

export default sizeMe()(inject(mapStoreToProps)(observer(stateful(ArrangeView))))