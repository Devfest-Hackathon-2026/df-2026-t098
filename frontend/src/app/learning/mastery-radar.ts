import { Component, computed, input } from '@angular/core';
import { topicLabel } from './topic-label';
import type { Language, TopicMastery } from './learning.types';

const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 86;

/** Six-axis radar of accuracy per interest, so learners see where they are strong and weak. */
@Component({
  selector: 'app-mastery-radar',
  template: `
    <figure>
      <svg [attr.viewBox]="'0 0 ' + size + ' ' + size" role="img" [attr.aria-label]="summary()">
        @for (ring of rings; track ring) {
          <polygon class="ring" [attr.points]="polygon(ring)" />
        }
        @for (axis of axes(); track axis.topic) {
          <line
            class="axis"
            [attr.x1]="center"
            [attr.y1]="center"
            [attr.x2]="axis.x"
            [attr.y2]="axis.y"
          />
          <text
            [attr.x]="axis.labelX"
            [attr.y]="axis.labelY"
            [attr.text-anchor]="axis.anchor"
            dominant-baseline="middle"
          >
            {{ axis.label }}
          </text>
        }
        <polygon class="shape" [attr.points]="shape()" />
        @for (axis of axes(); track axis.topic) {
          @if (axis.answered) {
            <circle class="dot" [attr.cx]="axis.valueX" [attr.cy]="axis.valueY" r="3.5" />
          }
        }
      </svg>
      <figcaption>
        <ul>
          @for (axis of axes(); track axis.topic) {
            <li>
              <span>{{ axis.label }}</span>
              <strong>{{ axis.answered ? axis.percent + '%' : '—' }}</strong>
              <small>{{ axis.correct }}/{{ axis.answered }}</small>
            </li>
          }
        </ul>
      </figcaption>
    </figure>
  `,
  styles: `
    figure {
      margin: 0;
      display: grid;
      gap: 12px;
      justify-items: center;
    }
    svg {
      width: min(100%, 300px);
      height: auto;
      overflow: visible;
    }
    .ring {
      fill: none;
      stroke: var(--border);
    }
    .axis {
      stroke: var(--border);
    }
    .shape {
      fill: color-mix(in srgb, var(--accent) 28%, transparent);
      stroke: var(--accent);
      stroke-width: 2;
      stroke-linejoin: round;
    }
    .dot {
      fill: var(--accent);
    }
    text {
      fill: var(--muted);
      font-size: 11px;
    }
    figcaption {
      width: 100%;
    }
    ul {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 6px 16px;
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: 13px;
    }
    li {
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    li span {
      flex: 1;
      color: var(--muted);
    }
    small {
      color: var(--muted);
      font-size: 11px;
    }
  `,
})
export class MasteryRadar {
  readonly interests = input.required<TopicMastery[]>();
  readonly language = input<Language>('ja');
  protected readonly size = SIZE;
  protected readonly center = CENTER;
  protected readonly rings = [0.25, 0.5, 0.75, 1];

  protected readonly axes = computed(() => {
    const items = this.interests();
    return items.map((item, index) => {
      const angle = (Math.PI * 2 * index) / items.length - Math.PI / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // Unanswered interests sit at a small baseline so the shape stays readable.
      const value = item.answered ? Math.max(0.08, item.mastery) : 0.04;
      return {
        topic: item.topic,
        label: topicLabel(item.topic, this.language()),
        answered: item.answered,
        correct: item.correct,
        percent: Math.round(item.mastery * 100),
        x: CENTER + RADIUS * cos,
        y: CENTER + RADIUS * sin,
        valueX: CENTER + RADIUS * value * cos,
        valueY: CENTER + RADIUS * value * sin,
        labelX: CENTER + (RADIUS + 18) * cos,
        labelY: CENTER + (RADIUS + 14) * sin,
        anchor: Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end',
      };
    });
  });

  protected readonly shape = computed(() =>
    this.axes()
      .map((axis) => `${axis.valueX.toFixed(1)},${axis.valueY.toFixed(1)}`)
      .join(' '),
  );

  protected readonly summary = computed(() =>
    this.axes()
      .map((axis) => `${axis.label}: ${axis.answered ? axis.percent + '%' : '—'}`)
      .join(', '),
  );

  protected polygon(scale: number): string {
    const count = this.interests().length || 6;
    return Array.from({ length: count }, (_, index) => {
      const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
      return `${(CENTER + RADIUS * scale * Math.cos(angle)).toFixed(1)},${(
        CENTER +
        RADIUS * scale * Math.sin(angle)
      ).toFixed(1)}`;
    }).join(' ');
  }
}
