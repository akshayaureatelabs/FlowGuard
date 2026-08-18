# FlowGuard Chrome Recorder

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select this `extensions/chrome` folder
4. Open any website → click extension → **Start recording**
5. Click / type through your flow → **Stop**
6. **Copy steps JSON** → paste into FlowGuard test via API or editor import (coming next)

Recorded steps match FlowGuard step schema (`navigate`, `click`, `type`, `select`).
