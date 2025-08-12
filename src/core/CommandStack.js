// src/core/CommandStack.js
export class CommandStack {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
  }
  exec(cmd) {
    cmd.do();
    this.undoStack.push(cmd);
    this.redoStack.length = 0;
  }
  undo() {
    const c = this.undoStack.pop();
    if (c) {
      c.undo();
      this.redoStack.push(c);
    }
  }
  redo() {
    const c = this.redoStack.pop();
    if (c) {
      c.do();
      this.undoStack.push(c);
    }
  }
}
