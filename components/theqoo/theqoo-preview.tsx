'use client';
import { useState } from 'react';
import { TheQooApp } from './theqoo-app';
export function TheQooPreview() {
  const [open, setOpen] = useState(true);
  return open ? <div className="tq-preview"><TheQooApp preview initialMode="demo" onClose={() => setOpen(false)} /></div> : <div className="tq-preview-exit"><p>已退出论坛，帖子和点赞仍然保存。</p><button onClick={() => setOpen(true)}>重新打开论坛</button></div>;
}
