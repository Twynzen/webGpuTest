import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { WebGpuService } from './core/services/ai/webgpu.service';

interface NavItem {
  path: string;
  label: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="app-container">
      <!-- Sidebar Navigation -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1 class="logo">
            <span class="logo-icon">🧠</span>
            <span class="logo-text">Web AI Suite</span>
          </h1>
          <p class="logo-subtitle">Browser AI Playground</p>
        </div>

        <!-- WebGPU Status -->
        <div class="webgpu-status" [class.available]="webGpu.isAvailable()">
          <div class="status-indicator"></div>
          <div class="status-text">
            <span class="status-label">WebGPU</span>
            <span class="status-value">
              {{ webGpu.isAvailable() ? 'Available' : 'Unavailable (using WASM)' }}
            </span>
          </div>
        </div>

        <!-- Navigation -->
        <nav class="nav-list">
          @for (item of navItems; track item.path) {
            <a
              class="nav-item"
              [routerLink]="item.path"
              routerLinkActive="active"
            >
              <span class="nav-icon">{{ item.icon }}</span>
              <div class="nav-content">
                <span class="nav-label">{{ item.label }}</span>
                <span class="nav-description">{{ item.description }}</span>
              </div>
            </a>
          }
        </nav>

        <!-- Footer -->
        <div class="sidebar-footer">
          <p class="footer-text">
            All AI runs 100% locally in your browser
          </p>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .app-container {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    .sidebar {
      width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .sidebar-header {
      padding: 1.5rem;
      border-bottom: 1px solid var(--border-color);
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--text-primary);
    }

    .logo-icon {
      font-size: 1.5rem;
    }

    .logo-subtitle {
      font-size: 0.75rem;
      color: var(--text-muted);
      margin-top: 0.25rem;
    }

    .webgpu-status {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1.5rem;
      background: var(--bg-tertiary);
      border-bottom: 1px solid var(--border-color);
    }

    .status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--danger-color);
      box-shadow: 0 0 8px var(--danger-color);
    }

    .webgpu-status.available .status-indicator {
      background: var(--secondary-color);
      box-shadow: 0 0 8px var(--secondary-color);
    }

    .status-text {
      display: flex;
      flex-direction: column;
    }

    .status-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .status-value {
      font-size: 0.8rem;
      color: var(--text-primary);
    }

    .nav-list {
      flex: 1;
      padding: 1rem 0.75rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: var(--radius-md);
      color: var(--text-secondary);
      text-decoration: none;
      transition: all 0.2s;

      &:hover {
        background: var(--bg-tertiary);
        color: var(--text-primary);
      }

      &.active {
        background: var(--primary-color);
        color: white;

        .nav-description {
          color: rgba(255, 255, 255, 0.8);
        }
      }
    }

    .nav-icon {
      font-size: 1.25rem;
      width: 2rem;
      text-align: center;
    }

    .nav-content {
      display: flex;
      flex-direction: column;
    }

    .nav-label {
      font-weight: 500;
      font-size: 0.875rem;
    }

    .nav-description {
      font-size: 0.7rem;
      color: var(--text-muted);
    }

    .sidebar-footer {
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--border-color);
    }

    .footer-text {
      font-size: 0.7rem;
      color: var(--text-muted);
      text-align: center;
    }

    .main-content {
      flex: 1;
      overflow-y: auto;
      background: var(--bg-primary);
    }
  `],
})
export class AppComponent implements OnInit {
  readonly webGpu = inject(WebGpuService);

  readonly navItems: NavItem[] = [
    {
      path: 'npc-brain',
      label: 'NPC Brain',
      icon: '🤖',
      description: 'Chat with AI NPCs',
    },
    {
      path: 'semantic-search',
      label: 'Semantic Search',
      icon: '🔍',
      description: 'Search by meaning',
    },
    {
      path: 'object-remover',
      label: 'Object Remover',
      icon: '✂️',
      description: 'Remove backgrounds',
    },
    {
      path: 'telekinetic-ui',
      label: 'Telekinetic UI',
      icon: '✋',
      description: 'Hand gesture control',
    },
    {
      path: 'live-translator',
      label: 'Live Translator',
      icon: '🎙️',
      description: 'Real-time translation',
    },
  ];

  async ngOnInit() {
    await this.webGpu.checkAvailability();
  }
}
