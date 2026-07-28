import {
  Component,
  input,
  output,
  signal,
  computed,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { PipelineConfig, DeploymentStageInfo } from '../../models/azure-devops.models';
import { AzureDevOpsService } from '../../services/azure-devops.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnChanges {
  readonly config = input.required<PipelineConfig>();
  readonly reconfigure = output<void>();

  private adoService = inject(AzureDevOpsService);

  stages = signal<DeploymentStageInfo[]>([]);
  loading = signal(false);
  errorMessage = signal<string | null>(null);
  lastRefreshed = signal<Date | null>(null);

  readonly title = computed(() => {
    const cfg = this.config();
    return `${cfg.projectName} — Pipeline #${cfg.pipelineId}`;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      this.refresh();
    }
  }

  refresh(): void {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.adoService.loadDashboard(this.config()).subscribe({
      next: (data) => {
        this.stages.set(data);
        this.lastRefreshed.set(new Date());
        this.loading.set(false);
      },
      error: (err: Error) => {
        console.error('[DashboardComponent] Failed to load dashboard data.', {
          error: err,
          config: {
            organizationUrl: this.config().organizationUrl,
            projectName: this.config().projectName,
            pipelineId: this.config().pipelineId,
          },
        });
        this.errorMessage.set(
          err?.message ?? 'An unexpected error occurred while loading the dashboard.'
        );
        this.loading.set(false);
      },
    });
  }

  stageStatusClass(stage: DeploymentStageInfo): string {
    if (stage.runState !== 'completed') return 'status-running';
    switch (stage.runResult) {
      case 'succeeded':
        return 'status-success';
      case 'failed':
        return 'status-failed';
      case 'canceled':
        return 'status-canceled';
      default:
        return 'status-unknown';
    }
  }

  stageStatusLabel(stage: DeploymentStageInfo): string {
    if (stage.runState === 'inProgress') return 'In Progress';
    if (stage.runState === 'pending') return 'Pending';
    if (stage.runState === 'canceling') return 'Canceling';
    switch (stage.runResult) {
      case 'succeeded':
        return 'Succeeded';
      case 'failed':
        return 'Failed';
      case 'canceled':
        return 'Canceled';
      case 'skipped':
        return 'Skipped';
      default:
        return stage.runResult ?? stage.runState ?? 'Unknown';
    }
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).catch(() => undefined);
  }
}
