// Type declarations for the <wayfinder-map> custom element
import type React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "wayfinder-map": React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement> & {
        "data-url"?: string;
        "map-url"?: string;
        "default-floor"?: string;
        "enable-rotation"?: string;
        "level-selector"?: string;
        "you-are-here-node-id"?: string;
        "focus-node-id"?: string;
        "desktop-render-scale"?: string;
        "mobile-render-scale"?: string;
        "desktop-max-zoom"?: string;
        "mobile-max-zoom"?: string;
      };
    }
  }
}
