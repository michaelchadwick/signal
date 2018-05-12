import { Dispatcher } from "browser-main/createDispatcher";

export default class VelocityMouseHandler {
  dispatch: Dispatcher

  changeVelocity(notes, velocity) {
    this.dispatch("CHANGE_NOTES_VELOCITY", { notes, velocity })
  }

  onMouseDown = e => {
    const items = e.items
    if (items.length === 0) {
      return
    }

    const rect = e.currentTarget.getBoundingClientRect()

    function calcValue(e) {
      return Math.round(Math.max(0, Math.min(1, (1 - (e.clientY - rect.top) / rect.height))) * 127)
    }

    this.changeVelocity(items, calcValue(e))

    const onMouseMove = e => {
      this.changeVelocity(items, calcValue(e))
    }

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove)
      document.removeEventListener("mouseup", onMouseUp)
    }

    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
  }
}