const DATA_URL =
  "https://raw.githubusercontent.com/JayGupta797/course-network/main/graph.json";

const state = {
  nodes: [],
  links: [],
  nodeById: new Map(),
  selectedNode: null,
  searchQuery: "",
  sortColumn: "name",
  sortDirection: "ascending",
  graph: null,
};

const MOBILE_QUERY = window.matchMedia("(max-width: 900px)");

const elements = {
  app: document.getElementById("app"),
  graph: document.getElementById("graph"),
  graphLoading: document.getElementById("graphLoading"),
  tableBody: document.getElementById("tableBody"),
  legendBody: document.getElementById("legendBody"),
  searchInput: document.getElementById("searchInput"),
  tabs: document.querySelectorAll(".tab"),
  panels: document.querySelectorAll(".panel"),
  sortButtons: document.querySelectorAll(".sort-btn"),
  viewButtons: document.querySelectorAll(".view-btn"),
  resetViewBtn: document.getElementById("resetViewBtn"),
};

function applyGraphTheme() {
  if (!state.graph) return;

  state.graph
    .backgroundColor("transparent")
    .linkColor(() => "rgba(148, 163, 184, 0.28)");
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function prepareGraphData(rawNodes, rawLinks) {
  const degree = new Map();

  rawLinks.forEach(({ source, target }) => {
    degree.set(source, (degree.get(source) || 0) + 1);
    degree.set(target, (degree.get(target) || 0) + 1);
  });

  const nodes = rawNodes
    .filter((node) => degree.has(node.id))
    .map((node) => ({
      ...node,
      forward: [],
      neighbors: [],
      links: [],
      incomingCount: 0,
      outgoingCount: 0,
    }));

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const links = rawLinks.filter(
    (link) => nodeById.has(link.source) && nodeById.has(link.target)
  );

  links.forEach((link) => {
    const sourceNode = nodeById.get(link.source);
    const targetNode = nodeById.get(link.target);

    sourceNode.forward.push(targetNode);
    sourceNode.neighbors.push(targetNode);
    targetNode.neighbors.push(sourceNode);
    sourceNode.links.push(link);
    targetNode.links.push(link);
    sourceNode.outgoingCount += 1;
    targetNode.incomingCount += 1;
  });

  return { nodes, links, nodeById };
}

function generateGroupColors(groups) {
  const colors = new Map();
  const step = groups.length ? 360 / groups.length : 0;

  groups.forEach((group, index) => {
    colors.set(group, `hsl(${(index * step) % 360}, 55%, 52%)`);
  });

  return colors;
}

function assignNodeColors(nodes) {
  const groups = [...new Set(nodes.map((node) => node.group))].sort();
  const groupColors = generateGroupColors(groups);

  nodes.forEach((node) => {
    node.color = groupColors.get(node.group) || "#64748b";
  });

  return groupColors;
}

function renderLegend(groupColors) {
  const fragment = document.createDocumentFragment();

  [...groupColors.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([group, color]) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${group}</td>
        <td><div class="legend-swatch" style="background:${color}"></div></td>
      `;
      fragment.appendChild(row);
    });

  elements.legendBody.replaceChildren(fragment);
}

function compareNodes(a, b) {
  const direction = state.sortDirection === "ascending" ? 1 : -1;

  if (state.sortColumn === "name") {
    return direction * a.id.localeCompare(b.id);
  }
  if (state.sortColumn === "group") {
    return direction * a.group.localeCompare(b.group);
  }

  const key =
    state.sortColumn === "incoming" ? "incomingCount" : "outgoingCount";
  return direction * (a[key] - b[key]);
}

function getVisibleNodes() {
  const query = state.searchQuery.trim().toLowerCase();

  return state.nodes
    .filter((node) => !query || node.id.toLowerCase().includes(query))
    .sort(compareNodes);
}

function renderTable() {
  const visibleNodes = getVisibleNodes();
  const fragment = document.createDocumentFragment();

  visibleNodes.forEach((node) => {
    const row = document.createElement("tr");
    row.dataset.nodeId = node.id;
    row.innerHTML = `
      <td>${node.id}</td>
      <td>${node.incomingCount}</td>
      <td>${node.outgoingCount}</td>
      <td>${node.group}</td>
    `;
    fragment.appendChild(row);
  });

  elements.tableBody.replaceChildren(fragment);
}

function updateSortButtons() {
  elements.sortButtons.forEach((button) => {
    const isActive = button.dataset.sort === state.sortColumn;
    button.classList.toggle("ascending", isActive && state.sortDirection === "ascending");
    button.classList.toggle("descending", isActive && state.sortDirection === "descending");
  });
}

function focusOnNode(node) {
  if (!state.graph || !node) return;

  const focusIds = new Set([node.id, ...node.neighbors.map((n) => n.id)]);
  const duration = 1000;
  const padding = 100;

  const applyFocus = () => {
    const bbox = state.graph.getGraphBbox((n) => focusIds.has(n.id));

    if (bbox) {
      state.graph.zoomToFit(duration, padding, (n) => focusIds.has(n.id));
      return;
    }

    if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
      state.graph.centerAt(node.x, node.y, duration);
      state.graph.zoom(4, duration);
    }
  };

  const waitForLayout = (attempt = 0) => {
    if (Number.isFinite(node.x) && Number.isFinite(node.y)) {
      requestAnimationFrame(() => requestAnimationFrame(applyFocus));
      return;
    }

    if (attempt < 300) {
      requestAnimationFrame(() => waitForLayout(attempt + 1));
    }
  };

  waitForLayout();
}

function focusCourse(node) {
  if (!node) {
    state.selectedNode = null;
    return;
  }

  if (state.selectedNode?.id === node.id) {
    state.selectedNode = null;
    return;
  }

  state.selectedNode = node;
  focusOnNode(node);
}

function resetGraphView() {
  if (!state.graph || !state.nodes.length) return;

  state.selectedNode = null;
  state.graph.zoomToFit(1000, 80);
}

function initGraphControls() {
  elements.resetViewBtn?.addEventListener("click", resetGraphView);
}

function setMobileView(view) {
  if (!MOBILE_QUERY.matches) return;

  elements.app.classList.remove("view-split", "view-list", "view-graph");
  elements.app.classList.add(`view-${view}`);

  elements.viewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });

  requestAnimationFrame(resizeGraph);
}

function resizeGraph() {
  if (!state.graph) return;

  state.graph
    .width(elements.graph.clientWidth)
    .height(elements.graph.clientHeight);
}

function initMobileViewControls() {
  elements.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setMobileView(button.dataset.view);
    });
  });

  MOBILE_QUERY.addEventListener("change", () => {
    if (MOBILE_QUERY.matches) {
      setMobileView("split");
    } else {
      elements.app.classList.remove("view-list", "view-graph");
      elements.app.classList.add("view-split");
      resizeGraph();
    }
  });
}

function initTabs() {
  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const panelName = tab.dataset.panel;

      elements.tabs.forEach((item) => {
        const isActive = item === tab;
        item.classList.toggle("active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });

      elements.panels.forEach((panel) => {
        const isActive = panel.id === `panel-${panelName}`;
        panel.classList.toggle("active", isActive);
        panel.hidden = !isActive;
      });
    });
  });
}

function initTableInteractions() {
  elements.searchInput.addEventListener(
    "input",
    debounce((event) => {
      state.searchQuery = event.target.value;
      state.selectedNode = null;
      renderTable();
    }, 150)
  );

  elements.tableBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-node-id]");
    if (!row) return;

    focusCourse(state.nodeById.get(row.dataset.nodeId));
  });

  elements.sortButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const column = button.dataset.sort;

      if (state.sortColumn === column) {
        state.sortDirection =
          state.sortDirection === "ascending" ? "descending" : "ascending";
      } else {
        state.sortColumn = column;
        state.sortDirection = "ascending";
      }

      updateSortButtons();
      renderTable();
    });
  });
}

function initGraph() {
  const highlightNodes = new Set();
  const highlightLinks = new Set();

  const syncHighlights = () => {
    highlightNodes.clear();
    highlightLinks.clear();

    const node = state.selectedNode;
    if (!node) return;

    highlightNodes.add(node);
    node.neighbors.forEach((neighbor) => highlightNodes.add(neighbor));
    node.links.forEach((link) => highlightLinks.add(link));
  };

  state.graph = ForceGraph()(elements.graph)
    .backgroundColor("transparent")
    .autoPauseRedraw(false)
    .cooldownTicks(100)
    .nodeId("id")
    .nodeLabel("id")
    .nodeColor((node) => node.color)
    .nodeRelSize(5)
    .linkColor(() => "rgba(100, 116, 139, 0.35)")
    .linkDirectionalArrowLength(3.5)
    .linkDirectionalArrowRelPos(1)
    .linkWidth((link) => (highlightLinks.has(link) ? 3 : 1))
    .linkDirectionalParticles(2)
    .linkDirectionalParticleWidth((link) =>
      highlightLinks.has(link) ? 3 : 0
    )
    .onNodeClick((node) => focusCourse(node))
    .onBackgroundClick(() => {
      state.selectedNode = null;
    })
    .nodeCanvasObjectMode((node) =>
      highlightNodes.has(node) ? "before" : undefined
    )
    .nodeCanvasObject((node, ctx) => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, 7, 0, 2 * Math.PI, false);
      ctx.fillStyle =
        node === state.selectedNode ? "#f0f6fc" : "#8b949e";
      ctx.fill();
    })
    .onRenderFramePre(() => syncHighlights());

  applyGraphTheme();
  resizeGraph();
  window.addEventListener("resize", debounce(resizeGraph, 100));
}

function showLoadError(message) {
  elements.graphLoading.innerHTML = `<div class="graph-error">${message}</div>`;
}

async function init() {
  initTabs();
  initMobileViewControls();
  initGraphControls();
  initTableInteractions();
  updateSortButtons();
  initGraph();

  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
      throw new Error(`Failed to load graph data (${response.status})`);
    }

    const data = await response.json();
    const prepared = prepareGraphData(data.nodes, data.links);

    state.nodes = prepared.nodes;
    state.links = prepared.links;
    state.nodeById = prepared.nodeById;

    const groupColors = assignNodeColors(state.nodes);
    renderLegend(groupColors);
    renderTable();

    state.graph.graphData({
      nodes: state.nodes,
      links: state.links,
    });

    state.graph.onEngineStop(() => {
      resizeGraph();
    });

    resizeGraph();
    elements.graphLoading.classList.add("hidden");
    elements.resetViewBtn?.classList.remove("hidden");
  } catch (error) {
    showLoadError(
      error instanceof Error ? error.message : "Unable to load course network."
    );
  }
}

document.addEventListener("DOMContentLoaded", init);
