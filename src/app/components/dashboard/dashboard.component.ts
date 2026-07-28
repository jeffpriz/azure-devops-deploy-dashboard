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
import {
  PipelineConfig,
  DeploymentStageInfo,
  PipelineSummary,
} from '../../models/azure-devops.models';
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
  readonly pipelineChange = output<number>();
  readonly reconfigure = output<void>();

  private adoService = inject(AzureDevOpsService);

  stages = signal<DeploymentStageInfo[]>([]);
  pipelineOptions = signal<PipelineSummary[]>([]);
  pipelineOptionsLoading = signal(false);
  loading = signal(false);
  errorMessage = signal<string | null>(null);
  lastRefreshed = signal<Date | null>(null);

  readonly title = computed(() => {
    const cfg = this.config();
    return `${cfg.projectName} — Pipeline #${cfg.pipelineId}`;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['config']) {
      const change = changes['config'];
      if (
        change.firstChange ||
        this.hasPipelineSourceChanged(
          change.previousValue as PipelineConfig | undefined,
          change.currentValue as PipelineConfig
        )
      ) {
        this.loadPipelineOptions();
      }
      this.refresh();
    }
  }

  private hasPipelineSourceChanged(
    previous: PipelineConfig | undefined,
    current: PipelineConfig
  ): boolean {
    if (!previous) return true;
    return (
      previous.organizationUrl !== current.organizationUrl ||
      previous.projectName !== current.projectName ||
      previous.pat !== current.pat
    );
  }

  private loadPipelineOptions(): void {
    const cfg = this.config();
    const currentPipelineOption = this.currentPipelineOption(cfg.pipelineId);
    this.pipelineOptionsLoading.set(true);
    this.adoService
      .listPipelines({
        organizationUrl: cfg.organizationUrl,
        projectName: cfg.projectName,
        pat: cfg.pat,
      })
      .subscribe({
        next: (pipelines) => {
          const selectedExists = pipelines.some((pipeline) => pipeline.id === cfg.pipelineId);
          this.pipelineOptions.set(
            selectedExists
              ? pipelines
              : [currentPipelineOption, ...pipelines]
          );
          this.pipelineOptionsLoading.set(false);
        },
        error: () => {
          this.pipelineOptions.set([currentPipelineOption]);
          this.pipelineOptionsLoading.set(false);
        },
      });
  }

  private currentPipelineOption(pipelineId: number): PipelineSummary {
    return { id: pipelineId, name: `Current Pipeline #${pipelineId}` };
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

  onPipelineSelected(event: Event): void {
    const selectedValue = Number((event.target as HTMLSelectElement).value);
    if (!Number.isInteger(selectedValue) || selectedValue <= 0) return;
    if (selectedValue === this.config().pipelineId) return;
    this.pipelineChange.emit(selectedValue);
  }
}
