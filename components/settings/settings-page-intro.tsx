"use client";

import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export function SettingsPageIntro({ icon: Icon, title, description, color }: {
    icon: LucideIcon;
    title: string;
    description: string;
    color: string;
}) {
    return (
        <header className="settings-page-intro" style={{ "--settings-intro-color": color } as CSSProperties}>
            <span className="settings-page-intro-icon"><Icon size={38} strokeWidth={1.55} /></span>
            <h1>{title}</h1>
            <p>{description}</p>
        </header>
    );
}
