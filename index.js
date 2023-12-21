const { mapRange } = require('canvas-sketch-util/math');
const { clipPolylinesToBox } = require('canvas-sketch-util/geometry');
const { contain } = require('./intrinsic-scale');
const svgPathParser = require('svg-path-parser');
const fs = require('fs');
const path = require('path');

const defaultConfig = {
  feedRate: 8000, // G1 movement (drawing speed)
  seekRate: 8000, // G0 movement (no drawing speed)
  onCommand: 'M03S20',
  offCommand: 'M03S0',
  powerDelay: 0.2,
  fileName: 'sketch',
  paperSize: [210, 297],
  margin: 10,
  flipX: false,
  flipY: false
};

class GCodeFile {
  constructor(config) {
    this.config = {
      ...defaultConfig,
      ...config
    }
    this.normalizeMargin()
    this.updateDrawArea()
    this.clear()
  }

  // New method to add SVG paths
  addSVG(svgPath) {
    const parsedPath = svgPathParser.parseSVG(svgPath);
    const polylines = convertPathToPolylines(parsedPath);
    this.addPolylines(polylines);
  }

  clear(){
    this.layers = []
    this.addLayer()
  }

  addLayer(name = ''){
    this.layers.push({
      name,
      gcode: ''
    })
    this.currentLayer = this.layers.length - 1
  }

  normalizeMargin() {
    if (typeof this.config.margin === 'number') {
      this.config.margin = [this.config.margin, this.config.margin, this.config.margin, this.config.margin]
    } else if (Array.isArray(this.config.margin)) {
      if (this.config.margin.length === 2) {
        this.config.margin[2] = this.config.margin[0]
        this.config.margin[3] = this.config.margin[1]
      }
    } else {
      throw new Error('Margin option can be a number or an array.')
    }
  }

  updateConfig(config = {}) {
    this.config = {
      ...this.config,
      ...config
    }

    this.normalizeMargin()
    this.updateDrawArea()
  }

  updateDrawArea() {
    this.drawArea = [
      this.config.paperSize[0] - this.config.margin[0] - this.config.margin[2],
      this.config.paperSize[1] - this.config.margin[1] - this.config.margin[3]
    ]
  }

  updateCoordsArea(width, height) {
    this.coordsWidth = width
    this.coordsHeight = height
    this.updateDrawCoords()
  }

  updateDrawCoords() {
    const {
      offsetX,
      offsetY,
      width,
      height
    } = contain(this.drawArea[0], this.drawArea[1], this.coordsWidth, this.coordsHeight)
    this.offsetX = offsetX
    this.offsetY = offsetY
    this.drawWidth = width
    this.drawHeight = height
  }

  mapCoordsToDrawArea(x, y) {
    if (!this.coordsWidth) {
      throw new Error('Must call "updateCoordsArea" passing width and height of your coordinate system!')
    }
    if (!this.coordsHeight) {
      throw new Error('Must call "updateCoordsArea" passing width and height of your coordinate system!')
    }

    const coords = {
      x: this.config.margin[0] + this.offsetX + mapRange(x, 0, this.coordsWidth, 0, this.drawWidth, true),
      y: this.config.margin[1] + this.offsetY + mapRange(y, 0, this.coordsHeight, 0, this.drawHeight, true)
    }

    if (this.config.flipX) {
      coords.x = this.config.paperSize[0] - coords.x
    }

    if (this.config.flipY) {
      coords.y = this.config.paperSize[1] - coords.y
    }

    coords.x = parseFloat(coords.x.toFixed(3))
    coords.y = parseFloat(coords.y.toFixed(3))

    return coords
  }

  moveTo(x, y) {
    const coords = this.mapCoordsToDrawArea(x, y)
    this.layers[this.currentLayer].gcode += `\n${this.config.offCommand}\nG4 P${this.config.powerDelay}\nG0 X${coords.x} Y${coords.y}\n${this.config.onCommand}\nG4 P${this.config.powerDelay}`
  }

  drawLine(x, y) {
    const coords = this.mapCoordsToDrawArea(x, y)
    this.layers[this.currentLayer].gcode += `\nG1 X${coords.x} Y${coords.y}`
  }

  addPolylines(polylines) {
    const lines = clipPolylinesToBox(
      polylines,
      [0, 0, this.coordsWidth, this.coordsHeight]
    )

    lines.forEach(l => {
      l.forEach((point, i) => {
        if (i == 0) {
          this.moveTo(point[0], point[1])
        } else {
          this.drawLine(point[0], point[1])
        }
      })
    })
  }

  beginFile() {
    return `G0 F${this.config.seekRate}\nG1 F${this.config.feedRate}\nG90\nG21`
  }

  closeFile() {
    return `\n${this.config.offCommand}\nG4 P1\nG0 X0 Y0\nG4 P1`
  }

  downloadFile() {
    this.layers.forEach(layer => {
      // from https://stackoverflow.com/a/38019175
      const gcodeBlob = new Blob([this.beginFile()+layer.gcode+this.closeFile()], { type: 'text/plain;charset=utf-8' })
      const gcodeUrl = URL.createObjectURL(gcodeBlob)
      const downloadLink = document.createElement('a')
      downloadLink.href = gcodeUrl
      downloadLink.download = this.config.fileName + (layer.name ? `-${layer.name}` : '') + '.gcode'
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)
    })
  }
}

module.exports = GCodeFile
