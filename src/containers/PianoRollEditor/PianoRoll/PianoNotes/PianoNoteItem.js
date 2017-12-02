import Item from "components/Stage/Item"
import Rect from "model/Rect"

function colorStr({ r, g, b }, alpha = 1) {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${alpha})`
}

export default class PianoNoteItem extends Item {
  constructor(id, x, y, width, height, velocity, isSelected, isDrum, color, borderColor, selectedColor) {
    super()
    this.id = id
    this.noteBounds = new Rect(x, y, width, height)
    this.drumBounds = new Rect(x, y, height, height)
    this.velocity = velocity
    this.isSelected = isSelected
    this.isDrum = isDrum
    this.color = color
    this.borderColor = colorStr(borderColor)
    this.selectedColor = selectedColor
  }

  get bounds() {
    return this.isDrum ? this.drumBounds : this.noteBounds
  }

  render(ctx) {
    if (this.isDrum) {
      this.drawDrumNote(ctx)
    } else {
      this.drawNote(ctx)
    }
  }

  drawNote(ctx) {
    const alpha = this.velocity / 127
    const noteColor = this.isSelected ? this.selectedColor : this.color
    let { x, y, width, height } = this.bounds

    x = Math.round(x)
    y = Math.round(y)
    width = Math.round(width - 1) // 次のノートと被らないように小さくする
    height = Math.round(height)

    const grad = ctx.createLinearGradient(x, y, x, y + height)
    grad.addColorStop(0, colorStr(noteColor, alpha * 0.8))
    grad.addColorStop(1, colorStr(noteColor, alpha))

    ctx.fillStyle = grad
    ctx.strokeStyle = this.borderColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.rect(x, y, width, height, height / 5)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }

  drawDrumNote(ctx) {
    const alpha = this.velocity / 127
    const noteColor = this.isSelected ? colorStr(this.selectedColor) : colorStr(this.color, alpha)
    let { x, y, height } = this.bounds
    x = Math.round(x)
    y = Math.round(y)
    height = Math.round(height)
    const radius = Math.round(height / 2)

    ctx.beginPath()
    ctx.arc(x, y + radius, radius, 0, 2 * Math.PI)
    ctx.fillStyle = noteColor
    ctx.strokeStyle = this.borderColor
    ctx.lineWidth = 1
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}