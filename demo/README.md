# smolagents-ts Browser Demo

This demo showcases the `smolagents-ts` library running entirely in the browser, using **Pyodide** for Python execution and the **Browser File System Access API** for local file operations.

## Features

- **CodeAgent**: Uses LLM to write and execute Python code in the browser.
- **Local File Access**: Pick a local directory and let the agent analyze its contents.
- **Recursive Size Calculation**: The agent uses `list_directory` and `get_file_info` tools to traverse your local folders.

## How to Run

### 1. Install Dependencies

Ensure you have all necessary packages installed:

```bash
npm install
```

### 2. Build the Browser Bundle

We use a specialized `tsup` configuration to bundle the library for browser use. This handles shimming Node.js built-ins and bundling dependencies like Handlebars and OpenAI SDK.

```bash
npm run build:browser
```

This will create `dist-browser/smolagents.browser.global.js`.

### 3. Run the Demo

The File System Access API requires a **Secure Context** (HTTPS or localhost). You must serve the `demo/browser-directory.html` file using a local web server.

You can use `npx serve` or any other static server:

```bash
# From the project root
npx serve .
```

Then open your browser to `http://<your-lan-ip>:3000/demo/browser-directory.html`.

### 4. Usage

1. Enter your **OpenAI API Key**.
2. (Optional) Customize the **Base URL** and **Model**.
3. Click **1. Pick Local Directory** and select a folder you want the agent to analyze.
4. Click **2. Run CodeAgent**.
5. Watch the output as the agent plans, writes Python code, and calculates the total size of your directory.

## E2E Demo (Playwright)

The repository includes an automated browser-friendly demo page used by Playwright tests.

1. Ensure `.env` in the repo root includes:
   - `OPENAI_API_KEY`
   - `OPENAI_BASE_URL` (optional)
   - `OPENAI_MODEL` (optional)
2. Build the browser bundle:

```bash
npm run build:browser
```

3. Serve the repo root and open:

```bash
npx serve .
```

Then navigate to `http://localhost:3000/demo/e2e.html`.

4. Or run the automated E2E suite:

```bash
npm run test:e2e
```

## Demo Build Script

The `build:demo` script in `package.json` creates a static, deployable build of `demo/browser-directory.html` using Parcel. It is intended for packaging or deployment (e.g., GitHub Pages) and is not required for the local "How to Run" steps above.

## Observing Agent Progress

There are two primary ways to capture and display what the agent is doing (the code it writes and the results it gets) in your UI:

### 1. Using the Streaming API (Recommended)

The `agent.run()` method can return an `AsyncGenerator` that yields events as they happen.

```javascript
const stream = agent.run('your task', { stream: true });

for await (const event of stream) {
  if (event && typeof event === 'object') {
    // Capture generated Python code
    if (event.name === 'python_interpreter') {
      console.log(`Step ${agent.stepNumber} Code:`, event.arguments.code);
    }

    // Capture execution logs and observations
    if ('observation' in event) {
      console.log('Execution Result:', event.observation);
    }

    // Capture final answer
    if (event.is_final_answer) {
      console.log('Final Answer:', event.output);
    }
  }
}
```

### 2. Using Step Callbacks

You can provide a list of callback functions when initializing the agent. These functions are called after each step is completed with the full `ActionStep` object.

```javascript
const agent = new CodeAgent({
    model: model,
    tools: [...],
    step_callbacks: [
        (step) => {
            if (step.tool_calls) {
                console.log("Executed Tools:", step.tool_calls);
            }
            if (step.observations) {
                console.log("Step Result:", step.observations);
            }
        }
    ]
});
```

## Technical Details

- **Bundling**: `tsup.browser.config.ts` bundles all dependencies into a single IIFE file, exporting `SmolAgents` to the global scope.
- **Python Execution**: `PyodideExecutor` detects the browser environment and loads Pyodide from CDN.
- **Tools**: `BrowserListDirectoryTool`, `BrowserReadTextFileTool`, and `BrowserGetFileInfoTool` (in `src/tools/fs-tools.ts`) use the native `showDirectoryPicker()` and `FileSystemHandle` APIs.
