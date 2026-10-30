export interface CarouselBookmark { path: string; remainingMs: number }
/** Time belongs to the visible slide. A view unmount pauses, not resets, playback. */
export class CarouselPlayback {
  index = 0
  private due = 0
  constructor(readonly slides: Array<{ path: string; durationMs: number }>, now: number, bookmark?: CarouselBookmark) {
    const index = bookmark ? slides.findIndex(s => s.path === bookmark.path) : -1
    this.index = Math.max(0, index)
    const duration = slides[this.index]?.durationMs ?? 6500
    this.due = now + (index >= 0 && Number.isFinite(bookmark?.remainingMs) ? Math.max(1, Math.min(duration, bookmark!.remainingMs)) : duration)
  }
  tick(now: number): number {
    if (this.slides.length > 1 && now >= this.due) {
      this.index = (this.index + 1) % this.slides.length
      this.due = now + this.slides[this.index].durationMs
    }
    return this.index
  }
  /** 下一张的索引（不推进状态；用于切换前确认资源已就绪，防止闪现旧图） */
  peekNext(now: number): number {
    return this.slides.length > 1 && now >= this.due ? (this.index + 1) % this.slides.length : this.index
  }
  bookmark(now: number): CarouselBookmark {
    this.tick(now)
    return { path: this.slides[this.index]?.path ?? '', remainingMs: Math.max(1, this.due - now) }
  }
}
