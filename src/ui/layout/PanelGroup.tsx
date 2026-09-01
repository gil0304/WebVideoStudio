import React, { useEffect, useRef, useState } from 'react';

export interface PanelDef {
  name: string;
  content: React.ReactNode;
}

interface Props {
  panels: PanelDef[];
  initialActive?: string;
  onMenuAction?: (action: string) => void;
}

/** Tabbed panel group (Premiere-style panel frame). */
export function PanelGroup({ panels, initialActive }: Props) {
  const [active, setActive] = useState(initialActive ?? panels[0]?.name);
  const current = panels.find((p) => p.name === active) ?? panels[0];
  const activeRef = useRef<HTMLDivElement>(null);

  // Japanese tab labels are wide enough to overflow the strip; keep the
  // selected tab visible when it is switched from elsewhere (workspace change).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current?.name]);

  return (
    <div className="panel-group">
      <div className="panel-tabs">
        {panels.map((p) => {
          const isActive = p.name === current?.name;
          return (
            <div
              key={p.name}
              ref={isActive ? activeRef : undefined}
              className={`panel-tab ${isActive ? 'active' : ''}`}
              title={p.name}
              onClick={() => setActive(p.name)}
            >
              {p.name}
            </div>
          );
        })}
        <button className="panel-menu-btn" title="パネルメニュー">≡</button>
      </div>
      <div className="panel-body">{current?.content}</div>
    </div>
  );
}
