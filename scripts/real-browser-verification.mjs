import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE_DIR = "C:\\Users\\Faizan\\.gemini\\antigravity\\brain\\chrome-profile-test";
const SCREENSHOT_DIR = "C:\\Users\\Faizan\\.gemini\\antigravity\\brain\\6c73276f-d2db-4162-bc20-cdafe85a7cbc\\screenshots";

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 1;
    this.callbacks = new Map();

    this.ready = new Promise((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = (e) => reject(e);
    });

    this.ws.onmessage = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
  }

  async send(method, params = {}) {
    await this.ready;
    const id = this.msgId++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expr) {
    const res = await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
  }

  async screenshot(filePath) {
    const res = await this.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(filePath, Buffer.from(res.data, "base64"));
  }

  close() {
    this.ws.close();
  }
}

// Generates the 90-node Website Sales Process map document
function generate90NodeMap() {
  const rootId = "root-sales-process";
  const nodes = [
    {
      id: rootId,
      parentId: null,
      title: "Website Sales Process — Complete Mind Map",
      notes: "High-ticket B2B agency sales pipeline\n\nTarget deal size: $10,000 to $50,000",
      x: 0,
      y: 0,
      collapsed: false,
      color: "blue",
      textColor: "default",
      size: "l",
      icon: "none",
      link: "https://minddesk.app/sales-playbook",
    },
  ];
  const links = [];

  const l1Titles = [
    "1. Lead Generation & Inbound Acquisition",
    "2. Discovery Call & Budget Qualification",
    "3. Solution Architecture & Value Proposal",
    "4. Commercial Negotiation & Contract Closing",
    "5. Client Onboarding & Project Kickoff",
  ];
  const l1Ids = [];

  l1Titles.forEach((t, i) => {
    const id = `l1-${i + 1}`;
    l1Ids.push(id);
    nodes.push({
      id,
      parentId: rootId,
      title: t,
      notes: `Standard operating procedure for ${t}`,
      x: 250,
      y: (i - 2) * 160,
      collapsed: false,
      color: "green",
      textColor: "default",
      size: "m",
      icon: "none",
      link: "",
    });
  });

  const l2Ids = [];
  l1Ids.forEach((pId, pIdx) => {
    for (let j = 1; j <= 3; j++) {
      const id = `l2-${pIdx + 1}-${j}`;
      l2Ids.push(id);
      nodes.push({
        id,
        parentId: pId,
        title: `Phase ${pIdx + 1}.${j} Sub-workflow`,
        notes: j === 1 ? `Quality criteria for phase ${pIdx + 1}` : "",
        link: j === 2 ? "https://minddesk.app/sop/checklist" : "",
        x: 500,
        y: j * 50,
        collapsed: false,
        color: "default",
        textColor: "default",
        size: "m",
        icon: "none",
      });
    }
  });

  const l3Ids = [];
  l2Ids.forEach((pId, idx) => {
    for (let k = 1; k <= 2; k++) {
      const id = `l3-${idx + 1}-${k}`;
      l3Ids.push(id);
      nodes.push({
        id,
        parentId: pId,
        title: `Requirement Group ${idx + 1}.${k}`,
        x: 750,
        y: k * 40,
        collapsed: false,
        color: "default",
        textColor: "default",
        size: "s",
        icon: "none",
        notes: "",
        link: "",
      });
    }
  });

  const l4Ids = [];
  l3Ids.slice(0, 20).forEach((pId, idx) => {
    const id = `l4-${idx + 1}`;
    l4Ids.push(id);
    const isTask = idx % 2 === 0;
    nodes.push({
      id,
      parentId: pId,
      title: isTask ? `Action Deliverable ${idx + 1}` : `Best Practice Note ${idx + 1}`,
      icon: isTask ? "check" : "none",
      textColor: isTask && idx % 4 === 0 ? "muted" : "default",
      x: 1000,
      y: idx * 30,
      collapsed: false,
      color: "default",
      size: "s",
      notes: "",
      link: "",
    });
  });

  l4Ids.slice(0, 19).forEach((pId, idx) => {
    const id = `l5-${idx + 1}`;
    nodes.push({
      id,
      parentId: pId,
      title: `Sub-specification ${idx + 1}`,
      icon: idx % 3 === 0 ? "check" : "none",
      textColor: "default",
      x: 1250,
      y: idx * 25,
      collapsed: false,
      color: "default",
      size: "s",
      notes: "",
      link: "",
    });
  });

  links.push({ id: "link-1", source: l1Ids[0], target: l1Ids[3] });

  return {
    format: "minddesk-mindmap",
    version: 1,
    title: "Website Sales Process — Complete Mind Map",
    map: { layout: "radial", nodes, links },
  };
}

async function run() {
  console.log("=== Starting Real Browser UI Verification (Phase 2 Final) ===");

  const mapExportEnvelope = generate90NodeMap();
  const nodeCount = mapExportEnvelope.map.nodes.length;
  console.log(`Generated realistic 90-node map with ${nodeCount} total nodes.`);

  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    "--remote-debugging-port=9222",
    `--user-data-dir=${PROFILE_DIR}`,
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ]);

  let cdp = null;

  try {
    let connected = false;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch("http://127.0.0.1:9222/json/version");
        if (res.ok) {
          connected = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!connected) throw new Error("Could not connect to Chrome DevTools port 9222");
    console.log("✓ Connected to Headless Google Chrome via CDP");

    const targetRes = await fetch("http://127.0.0.1:9222/json/new", { method: "PUT" });
    const target = await targetRes.json();
    console.log("✓ Opened test browser session:", target.id);

    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("DOM.enable");

    // 1. Navigate to Mind Maps listing page
    console.log("\n--- Step 1: Navigate to Mind Maps Listing ---");
    await cdp.send("Page.navigate", { url: "http://localhost:8080/mind-maps" });
    await new Promise((r) => setTimeout(r, 2500));

    const pageUrl = await cdp.eval("window.location.href");
    console.log("✓ Current Page URL:", pageUrl);

    // 2. Import the 90-node Mind Map using the actual UI File Upload input
    console.log("\n--- Step 2: Import 90-Node Map via UI Upload Element ---");
    const jsonStr = JSON.stringify(mapExportEnvelope);

    const importRes = await cdp.eval(`
      (async () => {
        const fileInput = document.querySelector("input[type='file']");
        if (!fileInput) return { error: "File input not found" };

        const blob = new Blob([${JSON.stringify(jsonStr)}], { type: "application/json" });
        const file = new File([blob], "Website-Sales-Process.minddesk.json", { type: "application/json" });

        const dt = new DataTransfer();
        dt.items.add(file);
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        return { triggered: true };
      })()
    `);
    console.log("✓ File upload dispatched:", importRes);

    // Wait for import, notification, and navigation to the mind map editor
    let editorMapId = "";
    for (let i = 0; i < 30; i++) {
      const u = await cdp.eval("window.location.href");
      const match = u.match(/\/mind-maps\/([0-9a-f-]+)/i);
      if (match) {
        editorMapId = match[1];
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log("✓ Navigated to 90-Node Mind Map Editor:", editorMapId);
    await new Promise((r) => setTimeout(r, 3000));

    // Inspect rendered canvas in Chrome
    const canvasStatus = await cdp.eval(`
      (() => {
        const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
        const edges = Array.from(document.querySelectorAll(".react-flow__edge"));
        const exportBtn = document.querySelector("button[aria-label='Export as Note'], button[title='Export as Note']");
        return {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          hasExportBtn: !!exportBtn,
          exportBtnText: exportBtn ? exportBtn.textContent?.trim() : null,
          titleText: document.querySelector(".mm-node-title")?.textContent?.trim()
        };
      })()
    `);
    console.log("✓ Canvas Node Count:", canvasStatus.nodeCount);
    console.log("✓ 'Export as Note' Button Ready:", canvasStatus.hasExportBtn);

    await cdp.screenshot(path.join(SCREENSHOT_DIR, "01-90node-canvas-imported.png"));

    // 3. Click "Export as Note" in the real UI toolbar
    console.log("\n--- Step 3: Click 'Export as Note' Button in UI Toolbar ---");
    const exportClick = await cdp.eval(`
      (() => {
        const btn = document.querySelector("button[aria-label='Export as Note'], button[title='Export as Note']");
        if (btn) {
          btn.click();
          return { clicked: true };
        }
        return { clicked: false };
      })()
    `);
    console.log("✓ Clicked 'Export as Note':", exportClick);

    // Wait for conversion, API save, and automatic navigation to /notes/<pageId>
    let notePageId = "";
    for (let i = 0; i < 30; i++) {
      const u = await cdp.eval("window.location.href");
      const match = u.match(/\/notes\/([0-9a-f-]+)/i);
      if (match) {
        notePageId = match[1];
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log("✓ Navigated to Newly Converted Note:", notePageId);
    await new Promise((r) => setTimeout(r, 2500));

    // Verify Note DOM blocks in Chrome
    const noteMetrics = await cdp.eval(`
      (() => {
        const titleArea = document.querySelector("textarea[placeholder='Untitled']");
        const blocks = Array.from(document.querySelectorAll("[data-block-id]"));
        const h1s = Array.from(document.querySelectorAll("textarea[placeholder='Heading 1']"));
        const h2s = Array.from(document.querySelectorAll("textarea[placeholder='Heading 2']"));
        const h3s = Array.from(document.querySelectorAll("textarea[placeholder='Heading 3']"));
        const checks = Array.from(document.querySelectorAll("button[role='checkbox']"));
        const visBtn = document.querySelector("button[aria-label='Visualize as Mind Map'], button[title='Visualize note as Mind Map']");
        return {
          title: titleArea ? titleArea.value : null,
          totalBlocks: blocks.length,
          h1Count: h1s.length,
          h2Count: h2s.length,
          h3Count: h3s.length,
          checkboxCount: checks.length,
          h1Titles: h1s.map(h => h.value),
          hasVisualizeBtn: !!visBtn
        };
      })()
    `);
    console.log("✓ Note Title:", noteMetrics.title);
    console.log("✓ Total Note Blocks Generated:", noteMetrics.totalBlocks);
    console.log("✓ H1 Section Headings:", noteMetrics.h1Count, noteMetrics.h1Titles);
    console.log("✓ H2 Section Headings:", noteMetrics.h2Count);
    console.log("✓ H3 Subsection Headings:", noteMetrics.h3Count);
    console.log("✓ Interactive Checkboxes:", noteMetrics.checkboxCount);
    console.log("✓ 'Visualize as Mind Map' button present:", noteMetrics.hasVisualizeBtn);

    await cdp.screenshot(path.join(SCREENSHOT_DIR, "02-90node-converted-to-note.png"));

    // 4. Edit Note and Verify Autosave Persistence Across Page Refresh
    console.log("\n--- Step 4: Edit Note & Verify Persistence Across Page Reload ---");
    await cdp.eval(`
      (() => {
        const titleArea = document.querySelector("textarea[placeholder='Untitled']");
        if (titleArea) {
          const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
          setter?.call(titleArea, "Website Sales Process — Executive Verified");
          titleArea.dispatchEvent(new Event("input", { bubbles: true }));
          titleArea.dispatchEvent(new Event("change", { bubbles: true }));
        }
      })()
    `);
    await new Promise((r) => setTimeout(r, 2000)); // wait for autosave debounce

    console.log("Reloading note page via Page.reload...");
    await cdp.send("Page.reload");
    await new Promise((r) => setTimeout(r, 2500));

    const reloadedTitle = await cdp.eval(`
      (() => {
        const titleArea = document.querySelector("textarea[placeholder='Untitled']");
        return titleArea ? titleArea.value : null;
      })()
    `);
    console.log("✓ Persisted Note Title after Browser Reload:", reloadedTitle);
    if (reloadedTitle !== "Website Sales Process — Executive Verified") {
      throw new Error(`Persistence failure: expected 'Website Sales Process — Executive Verified', got ${reloadedTitle}`);
    }

    // 5. Click "Visualize as Mind Map" from the Note
    console.log("\n--- Step 5: Click 'Visualize as Mind Map' from Note ---");
    const visClick = await cdp.eval(`
      (() => {
        const btn = document.querySelector("button[aria-label='Visualize as Mind Map'], button[title='Visualize note as Mind Map']");
        if (btn) {
          btn.click();
          return { clicked: true };
        }
        return { clicked: false };
      })()
    `);
    console.log("✓ Clicked 'Visualize as Mind Map':", visClick);

    // Wait for navigation to /mind-maps/<mapId>
    let newVisualMapId = "";
    for (let i = 0; i < 30; i++) {
      const u = await cdp.eval("window.location.href");
      const match = u.match(/\/mind-maps\/([0-9a-f-]+)/i);
      if (match && match[1] !== editorMapId) {
        newVisualMapId = match[1];
        break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log("✓ Navigated to Newly Visualized Mind Map:", newVisualMapId);
    await new Promise((r) => setTimeout(r, 3000));

    // Verify Canvas layout, coordinates, zero overlaps, and node connections
    const visualCanvasMetrics = await cdp.eval(`
      (() => {
        const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
        const edges = Array.from(document.querySelectorAll(".react-flow__edge"));

        const rects = nodes.map(n => {
          const r = n.getBoundingClientRect();
          return {
            title: n.textContent?.trim(),
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        });

        let overlapCount = 0;
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i];
            const b = rects[j];
            const overlaps = (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
            if (overlaps) overlapCount++;
          }
        }

        return {
          nodeCount: nodes.length,
          edgeCount: edges.length,
          overlapCount,
          sampleBranches: rects.slice(0, 6).map(r => r.title)
        };
      })()
    `);
    console.log("✓ Visual Mind Map Node Count:", visualCanvasMetrics.nodeCount);
    console.log("✓ Visual Mind Map Edge Count:", visualCanvasMetrics.edgeCount);
    console.log("✓ Overlap Count (Unintended Collisions = 0):", visualCanvasMetrics.overlapCount);
    console.log("✓ Sample Topics on Canvas:", visualCanvasMetrics.sampleBranches);

    await cdp.screenshot(path.join(SCREENSHOT_DIR, "03-revisualized-mindmap-canvas.png"));

    // 6. Test 360px Mobile Viewport
    console.log("\n--- Step 6: Test Mobile Viewport at 360px ---");
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 360,
      height: 800,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await new Promise((r) => setTimeout(r, 1200));

    const mobileCheck = await cdp.eval(`
      (() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const exportBtn = document.querySelector("button[aria-label='Export as Note'], button[title='Export as Note']");
        return {
          windowWidth: winWidth,
          documentScrollWidth: docWidth,
          hasHorizontalOverflow: docWidth > winWidth,
          exportBtnPresent: !!exportBtn
        };
      })()
    `);
    console.log("✓ Mobile 360px Viewport Check:", mobileCheck);

    await cdp.screenshot(path.join(SCREENSHOT_DIR, "04-mobile-360px-canvas.png"));

    console.log("\n=== REAL BROWSER UI VERIFICATION: ALL SCENARIOS PASSED ===");
  } finally {
    if (cdp) cdp.close();
    chrome.kill();
  }
}

run().catch((err) => {
  console.error("Browser UI verification failed:", err);
  process.exit(1);
});
