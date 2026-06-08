import { Injectable, signal } from '@angular/core';

export type EmojiPickerVariant = 'input' | 'message-footer' | 'message-hover';

interface EmojiPickerState {
  owner: string;
  userId: string;
  variant: EmojiPickerVariant;
  alignRight: boolean;
  color: string;
  top: number;
  left: number;
  width: number;
  height: number;
  visible: boolean;
}

interface EmojiPickerOpenConfig {
  owner: string;
  userId: string;
  variant: EmojiPickerVariant;
  alignRight: boolean;
  color: string;
  onSelect: (emoji: string) => void;
}

@Injectable({ providedIn: 'root' })
export class EmojiPickerOverlayService {
  readonly mounted = signal(false);
  readonly state = signal<EmojiPickerState>(this.closedState());
  private selectHandler: ((emoji: string) => void) | null = null;

  warm(): void {
    this.mounted.set(true);
  }

  scheduleWarm(): void {
    if (this.mounted()) return;
    const run = () => this.warm();
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run);
    else setTimeout(run, 300);
  }

  open(anchor: HTMLElement, config: EmojiPickerOpenConfig): void {
    const rect = anchor.getBoundingClientRect();
    this.warm();
    this.selectHandler = config.onSelect;
    this.state.set({ ...config, top: rect.top, left: rect.left, width: rect.width, height: rect.height, visible: true });
  }

  close(owner?: string): void {
    if (owner && this.state().owner !== owner) return;
    this.selectHandler = null;
    this.state.set(this.closedState());
  }

  toggle(anchor: HTMLElement, config: EmojiPickerOpenConfig): void {
    if (this.isOpen(config.owner)) return this.close(config.owner);
    this.open(anchor, config);
  }

  isOpen(owner: string): boolean {
    const state = this.state();
    return state.visible && state.owner === owner;
  }

  select(emoji: string): void {
    this.selectHandler?.(emoji);
    this.close(this.state().owner);
  }

  private closedState(): EmojiPickerState {
    return { owner: '', userId: '', variant: 'input', alignRight: false, color: '#444df2', top: 0, left: 0, width: 0, height: 0, visible: false };
  }
}