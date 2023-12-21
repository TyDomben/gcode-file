const fs = require('fs');
const { mapRange } = require('canvas-sketch-util/math');
const { clipPolylinesToBox } = require('canvas-sketch-util/geometry');
const { contain } = require('./intrinsic-scale');
const svgPathParser = require('svg-path-parser');

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
  addSVGPath(svgPath) {
    const commands = svgPathParser(svgPath);

    commands.forEach(command => {
      const { code, x, y } = command;

      switch (code) {
        case 'M':
          this.moveTo(x, y);
          break;
        case 'L':
          this.drawLine(x, y);
          break;
        // Implement other necessary SVG path commands
      }
    });
  }
}

// Usage example
const gcodeFile = new GCodeFile();
gcodeFile.updateCoordsArea(210, 297); // Update based on your SVG dimensions

// Read SVG file
const svgContent = fs.readFileSync('live laugh love in block letters.svg', 'utf8');

// Extract path data from SVG content
const pathRegex = /<path\s+d="([^"]+)"/g;
let match;
while ((match = pathRegex.exec(svgContent)) !== null) {
  gcodeFile.addSVGPath(match[1]);
}

// Generate G-code
const gcode = gcodeFile.beginFile() + gcodeFile.layers.map(layer => layer.gcode).join('\n') + gcodeFile.closeFile();

// Save G-code to a file
fs.writeFileSync('output_gcode.nc', gcode);
