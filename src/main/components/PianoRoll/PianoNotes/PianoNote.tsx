import React, { useCallback, useRef, FC } from "react"
import { Graphics as PIXIGraphics, Rectangle } from "pixi.js"
import { IRect, IPoint } from "src/common/geometry"
import { useState } from "react"
import { Graphics } from "@inlet/react-pixi"
import isEqual from "lodash/isEqual"
import { NoteEvent } from "src/common/track"
import { NoteCoordTransform } from "src/common/transform"
import { useStores } from "main/hooks/useStores"
import { removeEvent } from "main/actions"

export interface PianoNoteMouseData {
  note: NoteEvent
  transform: NoteCoordTransform
}

export type PianoNoteItem = IRect & {
  id: number
  velocity: number
  isSelected: boolean

  // マウスイベントに必要な情報
  mouseData: PianoNoteMouseData
}

export interface PianoNoteProps {
  item: PianoNoteItem
  isDrum: boolean
  color: number
  borderColor: number
  selectedColor: number
  selectedBorderColor: number
  onClick: (e: PianoNoteClickEvent) => void
  onMouseDrag: (e: PianoNoteMouseEvent) => void
  onDoubleClick: (e: PianoNoteClickEvent) => void
}

export type MousePositionType = "left" | "center" | "right"

interface DragInfo {
  start: IPoint
  position: MousePositionType
  item: PianoNoteItem
}

const DOUBLE_CLICK_INTERVAL = 500

const useGestures = (
  item: PianoNoteItem,
  onClick: (e: PianoNoteClickEvent) => void,
  onMouseDrag: (e: PianoNoteMouseEvent) => void,
  onDoubleClick: (e: PianoNoteClickEvent) => void
) => {
  const [entered, setEntered] = useState(false)
  const [dragInfo, setDragInfo] = useState<DragInfo | null>(null)
  const [lastMouseDownTime, setLastMouseDownTime] = useState(0)
  const [cursor, setCursor] = useState("default")

  const mousedown = (e: PIXI.InteractionEvent) => {
    e.stopPropagation()
    e.data.originalEvent.stopImmediatePropagation()

    if (dragInfo !== null) {
      return
    }

    if (
      e.data.originalEvent.timeStamp - lastMouseDownTime <
      DOUBLE_CLICK_INTERVAL
    ) {
      onDoubleClick({
        nativeEvent: e,
        item,
      })
      return
    }

    const offset = e.data.getLocalPosition(e.target.parent)
    const local = {
      x: offset.x - item.x,
      y: offset.y - item.y,
    }
    const position = getPositionType(local.x, item.width)
    setDragInfo({
      start: offset,
      position,
      item,
    })
    setLastMouseDownTime(e.data.originalEvent.timeStamp)
  }
  const mouseup = useCallback(
    (e: PIXI.InteractionEvent) => {
      if (dragInfo !== null && lastMouseDownTime !== 0) {
        onClick({ nativeEvent: e, item })
      }
      setDragInfo(null)
    },
    [dragInfo, setDragInfo, lastMouseDownTime]
  )
  const endDragging = useCallback(() => setDragInfo(null), [setDragInfo])

  const ref = useRef<PIXIGraphics>(null)

  const extendEvent = (
    e: PIXI.InteractionEvent,
    dragInfo: DragInfo
  ): PianoNoteMouseEvent => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const offset = e.data.getLocalPosition(ref.current!.parent)
    return {
      nativeEvent: e,
      dragItem: dragInfo.item,
      dragStart: dragInfo.start,
      offset,
      position: dragInfo.position,
    }
  }

  const mousemove = useCallback(
    (e: PIXI.InteractionEvent) => {
      if (!entered && dragInfo === null) {
        return
      }

      // prevent click and double-click
      setLastMouseDownTime(0)

      // update cursor
      if (e.target !== null) {
        const offset = e.data.getLocalPosition(e.target.parent)
        const local = {
          x: offset.x - item.x,
          y: offset.y - item.y,
        }
        const position = getPositionType(local.x, item.width)
        const newCursor = mousePositionToCursor(position)
        if (newCursor !== cursor) {
          setCursor(newCursor)
        }
      }

      if (dragInfo !== null) {
        const ev = extendEvent(e, dragInfo)
        onMouseDrag(ev)
        e.stopPropagation()
        e.data.originalEvent.stopImmediatePropagation()
      }
    },
    [dragInfo, entered, cursor, setCursor, onMouseDrag, extendEvent]
  )

  const mouseover = useCallback(() => setEntered(true), [setEntered])
  const mouseout = useCallback(() => setEntered(false), [setEntered])

  return {
    ref,
    mouseover,
    mouseout,
    mousedown,
    mousemove,
    mouseup,
    mouseupoutside: endDragging,
    cursor,
  }
}

const mousePositionToCursor = (position: MousePositionType) => {
  switch (position) {
    case "center":
      return "move"
    case "left":
      return "w-resize"
    case "right":
      return "e-resize"
  }
}

export interface PianoNoteMouseEvent {
  nativeEvent: PIXI.InteractionEvent
  // ドラッグ開始時の item
  dragItem: PianoNoteItem
  position: MousePositionType
  offset: IPoint
  dragStart: IPoint
}

export interface PianoNoteClickEvent {
  nativeEvent: PIXI.InteractionEvent
  item: PianoNoteItem
}

// fake class that is only used to refer additional property information for Graphics
class PianoGraphics extends PIXIGraphics {
  item: PianoNoteItem
}

export const isPianoNote = (x: PIXI.DisplayObject): x is PianoGraphics =>
  x.name === "PianoNote"

const _PianoNote: FC<PianoNoteProps> = (props) => {
  const { item } = props
  const { rootStore } = useStores()

  const render = (g: PIXIGraphics) => {
    const alpha = item.velocity / 127
    const noteColor = item.isSelected ? props.selectedColor : props.color
    let { width, height } = item

    width = Math.round(width - 1) // 次のノートと被らないように小さくする
    height = Math.round(height)
    const lineColor = item.isSelected
      ? props.selectedBorderColor
      : props.borderColor

    g.clear()
      .lineStyle(1, lineColor, alpha)
      .beginFill(noteColor, alpha)
      .drawRect(0, 0, width, height)
      .endFill()
  }

  const renderDrumNote = (g: PIXIGraphics) => {
    const alpha = item.velocity / 127
    const noteColor = item.isSelected ? props.selectedColor : props.color
    const radius = Math.round(item.height / 2)

    g.clear()
      .lineStyle(1, props.borderColor, 1)
      .beginFill(noteColor, alpha)
      .drawCircle(0, radius / 2, radius)
  }

  const handleMouse = useGestures(
    item,
    props.onClick,
    props.onMouseDrag,
    props.onDoubleClick
  )

  const rightclick = useCallback(
    (e: PIXI.InteractionEvent) => {
      if (rootStore.pianoRollStore.mouseMode == "pencil") {
        removeEvent(rootStore)(item.id)
      }
    },
    [rootStore, item.id]
  )

  const data = {
    item,
  }

  return (
    <Graphics
      name="PianoNote"
      draw={props.isDrum ? renderDrumNote : render}
      x={Math.round(item.x)}
      y={Math.round(item.y)}
      interactive={true}
      hitArea={new Rectangle(0, 0, item.width, item.height)}
      {...handleMouse}
      rightclick={rightclick}
      {...data}
    />
  )
}

function getPositionType(localX: number, width: number): MousePositionType {
  const edgeSize = Math.min(width / 3, 8)
  if (localX <= edgeSize) {
    return "left"
  }
  if (width - localX <= edgeSize) {
    return "right"
  }
  return "center"
}

const areEqual = (props: PianoNoteProps, nextProps: PianoNoteProps) =>
  isEqual(props.item, nextProps.item) &&
  props.isDrum === nextProps.isDrum &&
  props.color === nextProps.color &&
  props.borderColor === nextProps.borderColor &&
  props.selectedColor === nextProps.selectedColor &&
  props.selectedBorderColor === nextProps.selectedBorderColor &&
  props.onClick === nextProps.onClick &&
  props.onMouseDrag === nextProps.onMouseDrag &&
  props.onDoubleClick === nextProps.onDoubleClick

export const PianoNote = React.memo(_PianoNote, areEqual)
