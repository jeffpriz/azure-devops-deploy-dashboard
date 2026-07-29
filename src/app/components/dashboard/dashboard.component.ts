import {
  Component,
  ElementRef,
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
  TabularPipelineData,
  TabularStageCellInfo,
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
  private hostElement = inject(ElementRef<HTMLElement>);

  stages = signal<DeploymentStageInfo[]>([]);
  tableData = signal<TabularPipelineData[]>([]);
  tableSelectedPipelineIds = signal<number[]>([]);
  pipelineOptions = signal<PipelineSummary[]>([]);
  pipelineOptionsLoading = signal(false);
  loading = signal(false);
  tableLoading = signal(false);
  errorMessage = signal<string | null>(null);
  tableErrorMessage = signal<string | null>(null);
  lastRefreshed = signal<Date | null>(null);
  viewMode = signal<'cards' | 'table'>('cards');
  tableFocusedRowIndex = signal(0);
  tableFocusedColumnIndex = signal(0);

  readonly title = computed(() => {
    const cfg = this.config();
    return cfg.pipelineId
      ? `${cfg.projectName} — Pipeline #${cfg.pipelineId}`
      : `${cfg.projectName} — Select a pipeline`;
  });

  readonly hasSelectedPipeline = computed(() => this.config().pipelineId !== null);
  readonly hasSelectedTablePipelines = computed(
    () => this.tableSelectedPipelineIds().length > 0
  );
  readonly hasNoTableData = computed(() => {
    const data = this.tableData();
    return data.length === 0 || data.every((pipeline) => Object.keys(pipeline.stages).length === 0);
  });
  readonly tableAriaColumnCount = computed(() => this.tableStageColumns().length + 1);
  readonly tableAriaRowCount = computed(() => this.tableData().length + 1);
  readonly tableStageColumns = computed(() => {
    const columns = new Map<string, { name: string; order: number }>();
    for (const pipeline of this.tableData()) {
      for (const [stageKey, stage] of Object.entries(pipeline.stages)) {
        const existing = columns.get(stageKey);
        if (!existing || stage.stageOrder < existing.order) {
          columns.set(stageKey, {
            name: stage.stageName || stageKey,
            order: stage.stageOrder,
          });
        }
      }
    }
    return Array.from(columns.entries())
      .sort(([, a], [, b]) => a.order - b.order)
      .map(([key, value]) => ({ key, name: value.name }));
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
        this.tableSelectedPipelineIds.set([]);
        this.tableData.set([]);
        this.tableErrorMessage.set(null);
        this.tableLoading.set(false);
      }
      if (this.hasSelectedPipeline()) {
        this.refresh();
      } else {
        this.loading.set(false);
        this.errorMessage.set(null);
        this.stages.set([]);
      }
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
    const currentPipelineOption = cfg.pipelineId
      ? this.currentPipelineOption(cfg.pipelineId)
      : null;
    this.pipelineOptionsLoading.set(true);
    this.adoService
      .listPipelines({
        organizationUrl: cfg.organizationUrl,
        projectName: cfg.projectName,
        pat: cfg.pat,
      })
      .subscribe({
        next: (pipelines) => {
          if (!currentPipelineOption) {
            this.pipelineOptions.set(pipelines);
            this.pipelineOptionsLoading.set(false);
            this.syncTableSelectionWithOptions(pipelines);
            return;
          }

          const selectedExists = pipelines.some((pipeline) => pipeline.id === cfg.pipelineId);
          this.pipelineOptions.set(
            selectedExists
              ? pipelines
              : [currentPipelineOption, ...pipelines]
          );
          this.pipelineOptionsLoading.set(false);
          this.syncTableSelectionWithOptions(this.pipelineOptions());
        },
        error: () => {
          this.pipelineOptions.set(currentPipelineOption ? [currentPipelineOption] : []);
          this.pipelineOptionsLoading.set(false);
        },
      });
  }

  private syncTableSelectionWithOptions(options: PipelineSummary[]): void {
    const validIds = new Set(options.map((option) => option.id));
    const nextSelection = this.tableSelectedPipelineIds().filter((id) =>
      validIds.has(id)
    );
    if (nextSelection.length !== this.tableSelectedPipelineIds().length) {
      this.tableSelectedPipelineIds.set(nextSelection);
    }
  }

  private currentPipelineOption(pipelineId: number): PipelineSummary {
    return { id: pipelineId, name: `Pipeline #${pipelineId} (Selected)` };
  }

  refresh(): void {
    if (!this.hasSelectedPipeline()) return;

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

  refreshTable(): void {
    const selectedPipelineIds = this.tableSelectedPipelineIds();
    if (selectedPipelineIds.length === 0) {
      this.tableData.set([]);
      this.resetTableGridFocus();
      this.tableLoading.set(false);
      this.tableErrorMessage.set(null);
      return;
    }

    this.tableLoading.set(true);
    this.tableErrorMessage.set(null);
    this.adoService.loadTabularDashboard(this.config(), selectedPipelineIds).subscribe({
      next: (data) => {
        const optionNames = new Map(
          this.pipelineOptions().map((pipeline) => [pipeline.id, pipeline.name] as const)
        );
        this.tableData.set(
          data.map((pipelineData) => ({
            ...pipelineData,
            pipelineName:
              optionNames.get(pipelineData.pipelineId) ?? pipelineData.pipelineName,
          }))
        );
        this.resetTableGridFocus();
        this.lastRefreshed.set(new Date());
        this.tableLoading.set(false);
      },
      error: (err: Error) => {
        this.tableErrorMessage.set(
          err?.message ?? 'An unexpected error occurred while loading tabular data.'
        );
        this.tableLoading.set(false);
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

  buildResultUrl(stage: DeploymentStageInfo): string | null {
    if (stage.buildUrl) {
      return stage.buildUrl;
    }

    if (!stage.buildRunId) {
      return null;
    }

    const cfg = this.config();
    const org = cfg.organizationUrl.replace(/\/+$/, '');
    return `${org}/${encodeURIComponent(cfg.projectName)}/_build/results?buildId=${stage.buildRunId}`;
  }

  onPipelineSelected(event: Event): void {
    const selectedValue = Number((event.target as HTMLSelectElement).value);
    if (!Number.isInteger(selectedValue) || selectedValue <= 0) return;
    if (selectedValue === this.config().pipelineId) return;
    this.pipelineChange.emit(selectedValue);
  }

  setViewMode(mode: 'cards' | 'table'): void {
    this.viewMode.set(mode);
    if (mode === 'table') {
      this.resetTableGridFocus();
    }
  }

  onTablePipelinesSelected(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const selectedPipelineIds = Array.from(select.selectedOptions)
      .map((option) => Number(option.value))
      .filter((value) => Number.isInteger(value) && value > 0);

    this.tableSelectedPipelineIds.set(selectedPipelineIds);
    this.refreshTable();
  }

  tableCellSummary(stage: TabularStageCellInfo): string {
    const segments = [stage.buildPipelineName, stage.buildNumber].filter(
      (value): value is string => !!value
    );
    return segments.length > 0 ? segments.join(' • ') : '—';
  }

  tableCellBuildUrl(stage: TabularStageCellInfo): string | null {
    return stage.buildUrl;
  }

  tableCellRunLabel(stage: TabularStageCellInfo): string {
    return stage.runName ? `Run ${stage.runName}` : `Run #${stage.runId}`;
  }

  tableStageStatusClass(stage: TabularStageCellInfo): string {
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

  tableStageStatusLabel(stage: TabularStageCellInfo): string {
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

  tableCellTabIndex(rowIndex: number, columnIndex: number): number {
    return this.tableFocusedRowIndex() === rowIndex &&
      this.tableFocusedColumnIndex() === columnIndex
      ? 0
      : -1;
  }

  onTableCellFocus(rowIndex: number, columnIndex: number): void {
    this.tableFocusedRowIndex.set(rowIndex);
    this.tableFocusedColumnIndex.set(columnIndex);
  }

  onTableCellKeydown(event: KeyboardEvent, rowIndex: number, columnIndex: number): void {
    const rowMax = Math.max(this.tableData().length - 1, 0);
    const columnMax = Math.max(this.tableAriaColumnCount() - 1, 0);

    let nextRow = rowIndex;
    let nextColumn = columnIndex;

    switch (event.key) {
      case 'ArrowUp':
        nextRow = Math.max(0, rowIndex - 1);
        break;
      case 'ArrowDown':
        nextRow = Math.min(rowMax, rowIndex + 1);
        break;
      case 'ArrowLeft':
        nextColumn = Math.max(0, columnIndex - 1);
        break;
      case 'ArrowRight':
        nextColumn = Math.min(columnMax, columnIndex + 1);
        break;
      case 'Home':
        nextColumn = 0;
        break;
      case 'End':
        nextColumn = columnMax;
        break;
      default:
        return;
    }

    event.preventDefault();
    this.focusTableCell(nextRow, nextColumn);
  }

  private focusTableCell(rowIndex: number, columnIndex: number): void {
    this.tableFocusedRowIndex.set(rowIndex);
    this.tableFocusedColumnIndex.set(columnIndex);
    const selector = `[data-grid-row="${rowIndex}"][data-grid-col="${columnIndex}"]`;
    this.hostElement.nativeElement.querySelector<HTMLElement>(selector)?.focus();
  }

  private resetTableGridFocus(): void {
    this.tableFocusedRowIndex.set(0);
    this.tableFocusedColumnIndex.set(0);
  }

}
