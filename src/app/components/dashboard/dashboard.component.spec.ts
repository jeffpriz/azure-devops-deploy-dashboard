import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { AzureDevOpsService } from '../../services/azure-devops.service';
import {
  DeploymentStageInfo,
  PipelineConfig,
  TabularPipelineData,
} from '../../models/azure-devops.models';

describe('DashboardComponent', () => {
  const config: PipelineConfig = {
    organizationUrl: 'https://dev.azure.com/myorg',
    projectName: 'MyProject',
    pipelineId: 1,
    pat: 'test-pat',
  };

  const adoService = {
    loadDashboard: vi.fn(() => of([] as DeploymentStageInfo[])),
    loadTabularDashboard: vi.fn(() => of([] as TabularPipelineData[])),
    listPipelines: vi.fn(() =>
      of([
        { id: 1, name: 'Deploy API' },
        { id: 2, name: 'Deploy Web' },
      ])
    ),
  };

  beforeEach(async () => {
    adoService.loadDashboard.mockClear();
    adoService.loadTabularDashboard.mockClear();
    adoService.listPipelines.mockClear();
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [{ provide: AzureDevOpsService, useValue: adoService }],
    }).compileComponents();
  });

  it('should emit a pipeline change when a different pipeline is selected', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const emitSpy = vi.spyOn(component.pipelineChange, 'emit');
    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(2);

    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(emitSpy).toHaveBeenCalledWith(2);
  });

  it('should wait for a pipeline selection before loading dashboard data', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', { ...config, pipelineId: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.value).toBe('');
    expect(select.options[0]?.textContent?.trim()).toBe('Choose a pipeline');
    expect(adoService.loadDashboard).not.toHaveBeenCalled();

    const component = fixture.componentInstance;
    const emitSpy = vi.spyOn(component.pipelineChange, 'emit');
    select.value = '2';
    select.dispatchEvent(new Event('change'));

    expect(emitSpy).toHaveBeenCalledWith(2);
  });

  it('should ignore invalid or unchanged pipeline selections', async () => {
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const emitSpy = vi.spyOn(component.pipelineChange, 'emit');

    component.onPipelineSelected({ target: { value: '0' } } as unknown as Event);
    component.onPipelineSelected({ target: { value: '-4' } } as unknown as Event);
    component.onPipelineSelected({ target: { value: 'abc' } } as unknown as Event);
    component.onPipelineSelected({ target: { value: '1' } } as unknown as Event);

    expect(emitSpy).not.toHaveBeenCalled();
  });

  it('should render Build pipeline and Build # as links when a build URL is present', async () => {
    adoService.loadDashboard.mockReturnValueOnce(
      of([
        {
          stageName: 'Production',
          stageIdentifier: 'production',
          stageOrder: 1,
          runId: 1001,
          runName: 'Deploy-1001',
          runState: 'completed',
          runResult: 'succeeded',
          runUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=1001',
          startTime: '2026-07-01T00:01:00Z',
          finishTime: '2026-07-01T00:08:00Z',
          buildPipelineName: 'Build Pipeline',
          buildRunId: 2001,
          buildUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=2001',
          buildNumber: '2026.07.03.1',
          commitId: null,
          commitShort: null,
          sourceBranch: null,
          repositoryName: null,
          requestedFor: null,
        },
      ])
    );

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', config);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('.build-link') as NodeListOf<HTMLAnchorElement>;
    expect(links.length).toBe(2);
    expect(links[0]?.textContent?.trim()).toBe('Build Pipeline');
    expect(links[0]?.getAttribute('href')).toBe(
      'https://dev.azure.com/myorg/MyProject/_build/results?buildId=2001'
    );
    expect(links[1]?.textContent?.trim()).toBe('2026.07.03.1');
    expect(links[1]?.getAttribute('href')).toBe(
      'https://dev.azure.com/myorg/MyProject/_build/results?buildId=2001'
    );
  });

  it('should load tabular data for multi-selected pipelines in table view', async () => {
    adoService.loadTabularDashboard.mockReturnValueOnce(of([]));

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', { ...config, pipelineId: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.setViewMode('table');
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      '.table-pipeline-picker select'
    ) as HTMLSelectElement;
    expect(select).not.toBeNull();

    select.options[0]!.selected = true;
    select.options[1]!.selected = true;
    select.dispatchEvent(new Event('change'));

    expect(adoService.loadTabularDashboard).toHaveBeenCalledWith(
      { ...config, pipelineId: null },
      [1, 2]
    );
  });

  it('should render one row per selected pipeline with blank cells for missing stage columns', async () => {
    adoService.loadTabularDashboard.mockReturnValueOnce(
      of([
        {
          pipelineId: 1,
          pipelineName: 'Deploy API',
          stages: {
            build: {
              stageIdentifier: 'build',
              stageName: 'Build',
              stageOrder: 1,
              runId: 101,
              runName: 'Run-101',
              runUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=101',
              runState: 'completed',
              runResult: 'succeeded',
              startTime: null,
              finishTime: null,
              buildPipelineName: 'Build API',
              buildRunId: 9001,
              buildUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=9001',
              buildNumber: '2026.07.01.1',
              commitId: null,
              commitShort: null,
              sourceBranch: null,
              repositoryName: null,
              requestedFor: null,
            },
          },
        },
        {
          pipelineId: 2,
          pipelineName: 'Deploy Web',
          stages: {
            deploy: {
              stageIdentifier: 'deploy',
              stageName: 'Deploy',
              stageOrder: 2,
              runId: 202,
              runName: 'Run-202',
              runUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=202',
              runState: 'completed',
              runResult: 'succeeded',
              startTime: null,
              finishTime: null,
              buildPipelineName: 'Build Web',
              buildRunId: 9002,
              buildUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=9002',
              buildNumber: '2026.07.01.2',
              commitId: null,
              commitShort: null,
              sourceBranch: null,
              repositoryName: null,
              requestedFor: null,
            },
          },
        },
      ] as TabularPipelineData[])
    );

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', { ...config, pipelineId: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.setViewMode('table');
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      '.table-pipeline-picker select'
    ) as HTMLSelectElement;
    select.options[0]!.selected = true;
    select.options[1]!.selected = true;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const headerCells = Array.from(
      fixture.nativeElement.querySelectorAll('.runs-table thead th') as NodeListOf<HTMLElement>
    ).map((element) => element.textContent?.trim());
    expect(headerCells).toContain('Build');
    expect(headerCells).toContain('Deploy');

    const blankCells = fixture.nativeElement.querySelectorAll('.runs-table .blank-cell');
    expect(blankCells.length).toBeGreaterThan(0);

    const rows = fixture.nativeElement.querySelectorAll('.runs-table tbody tr');
    expect(rows.length).toBe(2);
  });

  it('should render table view as an aria grid with keyboard-focusable cells', async () => {
    adoService.loadTabularDashboard.mockReturnValueOnce(
      of([
        {
          pipelineId: 1,
          pipelineName: 'Deploy API',
          stages: {
            build: {
              stageIdentifier: 'build',
              stageName: 'Build',
              stageOrder: 1,
              runId: 101,
              runName: 'Run-101',
              runUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=101',
              runState: 'completed',
              runResult: 'succeeded',
              startTime: null,
              finishTime: null,
              buildPipelineName: 'Build API',
              buildRunId: 9001,
              buildUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=9001',
              buildNumber: '2026.07.01.1',
              commitId: null,
              commitShort: null,
              sourceBranch: null,
              repositoryName: null,
              requestedFor: null,
            },
          },
        },
      ] as TabularPipelineData[])
    );

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', { ...config, pipelineId: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.setViewMode('table');
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      '.table-pipeline-picker select'
    ) as HTMLSelectElement;
    select.options[0]!.selected = true;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const grid = fixture.nativeElement.querySelector('.runs-table');
    expect(grid?.getAttribute('role')).toBe('grid');

    const firstRowHeader = fixture.nativeElement.querySelector(
      '.runs-table tbody [role="rowheader"]'
    ) as HTMLElement;
    const firstGridCell = fixture.nativeElement.querySelector(
      '.runs-table tbody [role="gridcell"]'
    ) as HTMLElement;
    expect(firstRowHeader.getAttribute('tabindex')).toBe('0');
    expect(firstGridCell.getAttribute('tabindex')).toBe('-1');

    firstRowHeader.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(firstGridCell.getAttribute('tabindex')).toBe('0');
  });

  it('should show only build link plus branch and commit details in table cells', async () => {
    adoService.loadTabularDashboard.mockReturnValueOnce(
      of([
        {
          pipelineId: 1,
          pipelineName: 'Deploy API',
          stages: {
            build: {
              stageIdentifier: 'build',
              stageName: 'Build',
              stageOrder: 1,
              runId: 101,
              runName: 'Run-101',
              runUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=101',
              runState: 'completed',
              runResult: 'succeeded',
              startTime: null,
              finishTime: null,
              buildPipelineName: 'Build API',
              buildRunId: 9001,
              buildUrl: 'https://dev.azure.com/myorg/MyProject/_build/results?buildId=9001',
              buildNumber: '2026.07.01.1',
              commitId: 'd34db33fd34db33fd34db33fd34db33fd34db33f',
              commitShort: 'd34db33f',
              sourceBranch: 'refs/heads/main',
              repositoryName: null,
              requestedFor: null,
            },
          },
        },
      ] as TabularPipelineData[])
    );

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.componentRef.setInput('config', { ...config, pipelineId: null });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.setViewMode('table');
    fixture.detectChanges();

    const select = fixture.nativeElement.querySelector(
      '.table-pipeline-picker select'
    ) as HTMLSelectElement;
    select.options[0]!.selected = true;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const buildLinks = fixture.nativeElement.querySelectorAll(
      '.runs-table tbody .build-link'
    ) as NodeListOf<HTMLAnchorElement>;
    expect(buildLinks.length).toBe(1);
    expect(buildLinks[0]?.textContent?.trim()).toContain('Build API');
    expect(buildLinks[0]?.textContent?.trim()).toContain('2026.07.01.1');

    const runLinks = fixture.nativeElement.querySelectorAll('.runs-table tbody .run-link');
    expect(runLinks.length).toBe(0);

    const statusBadges = fixture.nativeElement.querySelectorAll('.runs-table tbody .status-badge');
    expect(statusBadges.length).toBe(0);

    const cellText = fixture.nativeElement.querySelector('.runs-table tbody .stage-cell')
      ?.textContent as string;
    expect(cellText).toContain('Branch:');
    expect(cellText).toContain('refs/heads/main');
    expect(cellText).toContain('Commit:');
    expect(cellText).toContain('d34db33f');
  });
});
