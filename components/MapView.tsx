"use client";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useDataStore } from "@/lib/store";

interface Props {
  destinationId: number | null;
  onClose: () => void;
}

const KIOSK_NODE_KEY = "admin.kiosk.nodeId";
const SCRIPT_URL = "/api/proxy?url=https%3A%2F%2Fmaps-sunwayedu.getmallapp.com%2Fwayfinder-map.min.js";
const DATA_URL = "https://sunwayedu3-data.indoorcms.com/datas_v001.json.gz";
const MAP_URL  = "https://sunwayedu3-data.indoorcms.com/maps_v001.json.gz";

function ensureScript() {
  if (document.querySelector('[data-wayfinder-script]')) return;
  const s = document.createElement("script");
  s.type = "module";
  s.src = SCRIPT_URL;
  s.setAttribute("data-wayfinder-script", "1");
  document.head.appendChild(s);
}

export default function MapView({ destinationId, onClose }: Props) {
  const { nodes } = useDataStore();
  const mapRef = useRef<HTMLElement>(null);

  useEffect(() => { ensureScript(); }, []);

  // Add hover + long-press tooltips to wayfinder shadow DOM buttons
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const LABELS: Record<string, string> = {
      "locate-here":             "You Are Here",
      "locate-start":            "Start",
      "locate-focus":            "Destination",
      "nav-connector-lift":      "Lift Only",
      "nav-connector-escalator": "Escalator Only",
    };

    const attachTooltips = () => {
      try {
      const shadow = (map as HTMLElement & { shadowRoot: ShadowRoot }).shadowRoot;
      if (!shadow) return;

      // Inject tooltip style into shadow root once
      if (!shadow.querySelector("#wf-tooltip-style")) {
        const style = document.createElement("style");
        style.id = "wf-tooltip-style";
        style.textContent = `
          .wf-tooltip {
            position: absolute;
            right: calc(100% + 10px);
            top: 50%;
            transform: translateY(-50%);
            background: rgba(0,0,0,0.75);
            color: #fff;
            font-size: 13px;
            white-space: nowrap;
            padding: 4px 8px;
            border-radius: 6px;
            pointer-events: none;
            z-index: 9999;
          }
          .wayfinder-locate-button { position: relative; }
        `;
        shadow.appendChild(style);
      }

      shadow.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach(btn => {
        const action = btn.dataset.action ?? "";
        const label = LABELS[action];
        if (!label) return;

        // Hover tooltip (desktop/dev)
        btn.title = label;

        // Long-press tooltip (touch/kiosk)
        let timer: ReturnType<typeof setTimeout> | null = null;
        let tip: HTMLDivElement | null = null;

        const show = () => {
          if (tip) return;
          tip = document.createElement("div");
          tip.className = "wf-tooltip";
          tip.textContent = label;
          btn.appendChild(tip);
        };
        const hide = () => {
          if (timer) { clearTimeout(timer); timer = null; }
          tip?.remove();
          tip = null;
        };

        btn.addEventListener("touchstart", () => { timer = setTimeout(show, 400); }, { passive: true });
        btn.addEventListener("touchend",   hide, { passive: true });
        btn.addEventListener("touchmove",  hide, { passive: true });
      });
      } catch (_) { /* tooltip attachment is non-critical */ }
    };

    const enforceMinZoom = () => {
      const el = map as HTMLElement & {
        getViewState?: () => { scale: number };
        engine?: { zoom: (f: number) => void };
      };
      // Compute min zoom so the floor width (~1.0 world unit) fills the canvas
      const canvasWidth = map.getBoundingClientRect().width || window.innerWidth;
      const minZoom = canvasWidth * 0.95; // 95% of canvas width = floor almost fills viewport

      map.addEventListener("view-changed", (e: Event) => {
        const detail = (e as CustomEvent).detail?.viewState;
        if (detail && detail.scale < minZoom) {
          const factor = minZoom / detail.scale;
          el.engine?.zoom(factor);
        }
      });
    };

    const panToContent = () => {
      const el = map as HTMLElement & {
        centerOn: (x: number, y: number, opts?: { animate?: boolean }) => void;
      };

      map.addEventListener("floor-changed", (e: Event) => {
        const floorCode = (e as CustomEvent).detail?.floor as string | undefined;
        if (!floorCode) return;

        const { nodes: currentNodes, levels } = useDataStore.getState();
        const matchingLevel = Object.values(levels).find(l => l.code === floorCode);
        if (!matchingLevel) return;

        const floorNodes = currentNodes.filter(n => n.level === matchingLevel.id);
        if (!floorNodes.length) return;

        const cx = floorNodes.reduce((s, n) => s + n.x, 0) / floorNodes.length;
        const cy = floorNodes.reduce((s, n) => s + n.y, 0) / floorNodes.length;
        el.centerOn(cx, cy, { animate: false });
      });
    };

    if ((map as HTMLElement & { isInitialized?: boolean }).isInitialized) {
      attachTooltips();
      enforceMinZoom();
      panToContent();
    } else {
      map.addEventListener("ready", () => { attachTooltips(); enforceMinZoom(); panToContent(); }, { once: true });
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current as (HTMLElement & {
      isInitialized: boolean;
      navigateTo: (opts: { from: number; to: number }) => void;
      focusLocation: (id: number) => void;
    }) | null;
    if (!map || !destinationId) return;

    const navigate = () => {
      const rawNodeId = localStorage.getItem(KIOSK_NODE_KEY);
      if (rawNodeId) {
        const kioskNode = nodes.find(n => n.id === Number(rawNodeId));
        if (kioskNode?.location) {
          map.navigateTo({ from: kioskNode.location, to: destinationId });
          return;
        }
      }
      map.focusLocation(destinationId);
    };

    if (map.isInitialized) {
      navigate();
    } else {
      map.addEventListener("ready", navigate, { once: true });
    }
  }, [destinationId, nodes]);

  const kioskNodeId = typeof window !== "undefined"
    ? (localStorage.getItem(KIOSK_NODE_KEY) ?? undefined)
    : undefined;

  const content = (
    <div
      className="fixed inset-0 z-[60] bg-white flex flex-col slide-up"
      style={{ display: destinationId ? "flex" : "none" }}
    >
      <div
        className="flex items-center px-4 flex-shrink-0"
        style={{ paddingTop: 14, paddingBottom: 14, borderBottom: "0.5px solid #e5e5ea" }}
      >
        <button
          onClick={onClose}
          className="flex items-center gap-2"
          style={{ color: "var(--navy)" }}
        >
          <svg width="9" height="15" viewBox="0 0 9 15" fill="none">
            <path d="M8 1L1.5 7.5 8 14" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[17px]">Back</span>
        </button>
      </div>

      <wayfinder-map
        ref={mapRef}
        className="flex-1 min-h-0 w-full block"
        data-url={DATA_URL}
        map-url={MAP_URL}
        route-mode="lift"
        enable-rotation=""
        level-selector=""
        desktop-render-scale="1500"
        mobile-render-scale="1200"
        desktop-min-zoom="1300"
        mobile-min-zoom="700"
        you-are-here-node-id={kioskNodeId}
        control-active-bg-color="#00226B"
        map-marker-end-bg-color="#00226B"
        map-marker-connector-bg-color="#00226B"
      />
    </div>
  );

  return createPortal(content, document.body);
}
