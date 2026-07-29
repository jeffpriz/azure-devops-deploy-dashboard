import { Injectable, inject } from '@angular/core';
import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  HttpParams,
} from '@angular/common/http';
import {
  Observable,
  forkJoin,
  of,
  from,
  throwError,
} from 'rxjs';
import {
  map,
  switchMap,
  catchError,
  mergeMap,
  toArray,
} from 'rxjs/operators';
import {
  PipelineConfig,
  PipelineSummary,
  PipelineRun,
  TimelineRecord,
  BuildInfo,
  DeploymentStageInfo,
} from '../models/azure-devops.models';

interface RunsListResponse {
  value: PipelineRun[];
  count: number;
}

interface TimelineResponse {
  records: TimelineRecord[];
}

interface PipelinesListResponse {
  value: PipelineSummary[];
  count: number;
}

interface ResolvedPipelineResource {
  pipelineName: string | null;
  runId: number | null;
  runName: string | null;
  webUrl: string | null;
}

const API_VERSION = '7.1';
const MAX_RUNS_TO_FETCH = 100;

@Injectable({ providedIn: 'root' })
export class AzureDevOpsService {
  private http = inject(HttpClient);

  private logError(message: string, error: unknown, context?: Record<string, unknown>): void {
    console.error(`[AzureDevOpsService] ${message}`, {
      error,
      context,
    });
  }

  private logInfo(message: string, context?: Record<string, unknown>): void {
    console.info(`[AzureDevOpsService] ${message}`, { context });
  }

  private toErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof HttpErrorResponse) {
      const status = error.status ? ` (HTTP ${error.status})` : '';
      return `${fallbackMessage}${status}`;
    }
    if (error instanceof Error && error.message) {
      return `${fallbackMessage}: ${error.message}`;
    }
    return fallbackMessage;
  }

  private buildHeaders(pat: string): HttpHeaders {
    const encoded = btoa(':' + pat);
    return new HttpHeaders({
      Authorization: `Basic ${encoded}`,
    });
  }

  private normalizeOrgUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private pipelinesApiBase(config: Pick<PipelineConfig, 'organizationUrl' | 'projectName'>): string {
    const org = this.normalizeOrgUrl(config.organizationUrl);
    return `${org}/${encodeURIComponent(config.projectName)}/_apis/pipelines`;
  }

  private buildsApiBase(config: PipelineConfig): string {
    const org = this.normalizeOrgUrl(config.organizationUrl);
    return `${org}/${encodeURIComponent(config.projectName)}/_apis/build/builds`;
  }

  private webPipelineRunUrl(config: PipelineConfig, runId: number): string {
    const org = this.normalizeOrgUrl(config.organizationUrl);
    return `${org}/${encodeURIComponent(config.projectName)}/_build/results?buildId=${runId}`;
  }

  /** Fetch the latest runs for the configured deploy pipeline. */
  private getPipelineRuns(config: PipelineConfig): Observable<PipelineRun[]> {
    const url = `${this.pipelinesApiBase(config)}/${config.pipelineId}/runs`;
    const params = new HttpParams()
      .set('api-version', API_VERSION)
      .set('$top', String(MAX_RUNS_TO_FETCH));
    return this.http
      .get<RunsListResponse>(url, {
        headers: this.buildHeaders(config.pat),
        params,
      })
      .pipe(
        map((res) => res.value ?? []),
        catchError((error) => {
          this.logError('Failed to fetch pipeline runs.', error, {
            organizationUrl: config.organizationUrl,
            projectName: config.projectName,
            pipelineId: config.pipelineId,
          });
          return throwError(() =>
            new Error(this.toErrorMessage(error, 'Failed to load pipeline runs'))
          );
        })
      );
  }

  listPipelines(
    config: Pick<PipelineConfig, 'organizationUrl' | 'projectName' | 'pat'>
  ): Observable<PipelineSummary[]> {
    const url = this.pipelinesApiBase(config);
    const params = new HttpParams().set('api-version', API_VERSION);
    return this.http
      .get<PipelinesListResponse>(url, {
        headers: this.buildHeaders(config.pat),
        params,
      })
      .pipe(
        map((response) =>
          (response.value ?? []).filter((pipeline) => pipeline.id > 0 && !!pipeline.name)
        ),
        catchError((error) => {
          this.logError('Failed to list pipelines.', error, {
            organizationUrl: config.organizationUrl,
            projectName: config.projectName,
          });
          return throwError(() =>
            new Error(this.toErrorMessage(error, 'Failed to load pipelines'))
          );
        })
      );
  }

  /** Fetch full run details (includes pipeline resource references). */
  private getPipelineRunDetail(
    config: PipelineConfig,
    runId: number
  ): Observable<PipelineRun> {
    const url = `${this.pipelinesApiBase(config)}/${config.pipelineId}/runs/${runId}`;
    const params = new HttpParams().set('api-version', API_VERSION);
    return this.http.get<PipelineRun>(url, {
      headers: this.buildHeaders(config.pat),
      params,
    }).pipe(
      catchError((error) => {
        this.logError('Failed to fetch pipeline run details.', error, {
          runId,
          organizationUrl: config.organizationUrl,
          projectName: config.projectName,
          pipelineId: config.pipelineId,
        });
        return throwError(() => error);
      })
    );
  }

  /** Fetch the timeline (stage records) for a pipeline run. */
  private getTimeline(
    config: PipelineConfig,
    runId: number
  ): Observable<TimelineRecord[]> {
    const url = `${this.buildsApiBase(config)}/${runId}/timeline`;
    const params = new HttpParams().set('api-version', API_VERSION);
    return this.http
      .get<TimelineResponse>(url, {
        headers: this.buildHeaders(config.pat),
        params,
      })
      .pipe(
        map((res) => res.records ?? []),
        catchError((error) => {
          this.logError('Failed to fetch pipeline timeline.', error, {
            runId,
            organizationUrl: config.organizationUrl,
            projectName: config.projectName,
            pipelineId: config.pipelineId,
          });
          return of([] as TimelineRecord[]);
        })
      );
  }

  /** Fetch build information for a given build ID. */
  private getBuild(
    config: PipelineConfig,
    buildId: number
  ): Observable<BuildInfo | null> {
    const url = `${this.buildsApiBase(config)}/${buildId}`;
    const params = new HttpParams().set('api-version', API_VERSION);
    return this.http
      .get<BuildInfo>(url, {
        headers: this.buildHeaders(config.pat),
        params,
      })
      .pipe(
        catchError((error) => {
          this.logError('Failed to fetch build details.', error, {
            buildId,
            organizationUrl: config.organizationUrl,
            projectName: config.projectName,
            pipelineId: config.pipelineId,
          });
          return of(null);
        })
      );
  }

  /**
   * Main entry-point: loads the dashboard data.
   *
   * Algorithm:
   *  1. Fetch up to MAX_RUNS_TO_FETCH recent runs of the deploy pipeline.
   *  2. For each run (in parallel, capped at 10 concurrent) fetch:
   *       a. Full run detail  → gives us resources.pipelines (the build reference)
   *       b. Timeline records → gives us stage names and states
   *  3. Aggregate: for every unique stage name, keep the entry from the most
   *     recent run that contained that stage.
   *  4. Resolve the build artifact commit: for each stage's associated run,
   *     look up the first pipeline resource and fetch the corresponding build.
   */
  loadDashboard(config: PipelineConfig): Observable<DeploymentStageInfo[]> {
    type StageMap = Map<string, { stage: TimelineRecord; detail: PipelineRun; runUrl: string }>;

    return this.getPipelineRuns(config).pipe(
      switchMap((runs): Observable<StageMap> => {
        if (!runs || runs.length === 0) {
          return of(new Map() as StageMap);
        }

        // Fetch run detail + timeline for every run, capped at 10 concurrent.
        return from(runs).pipe(
          mergeMap(
            (run) =>
              forkJoin({
                detail: this.getPipelineRunDetail(config, run.id).pipe(
                  catchError(() => {
                    this.logInfo(
                      'Using pipeline run summary as fallback because details could not be loaded.',
                      { runId: run.id }
                    );
                    return of(run as PipelineRun);
                  })
                ),
                stages: this.getTimeline(config, run.id).pipe(
                  map((records) =>
                    records.filter((r) => r.type === 'Stage')
                  )
                ),
              }).pipe(map((result) => ({ run, ...result }))),
            10 // max concurrency
          ),
          toArray(),
          map((enrichedRuns) => this.aggregateStages(config, enrichedRuns))
        );
      }),
      switchMap((stageMap) => this.resolveBuildInfo(config, stageMap)),
      catchError((error) => {
        this.logError('Dashboard load failed.', error, {
          organizationUrl: config.organizationUrl,
          projectName: config.projectName,
          pipelineId: config.pipelineId,
        });
        return throwError(() =>
          new Error(this.toErrorMessage(error, 'Failed to load dashboard data'))
        );
      })
    );
  }

  /**
   * Aggregates stage data across all runs.
   * Returns a map keyed by stage identifier holding the most recent run
   * that contained that stage.
   */
  private aggregateStages(
    config: PipelineConfig,
    enrichedRuns: {
      run: PipelineRun;
      detail: PipelineRun;
      stages: TimelineRecord[];
    }[]
  ): Map<
    string,
    {
      stage: TimelineRecord;
      detail: PipelineRun;
      runUrl: string;
    }
  > {
    // Sort runs newest-first (by createdDate desc).
    const sorted = [...enrichedRuns].sort(
      (a, b) =>
        new Date(b.run.createdDate).getTime() -
        new Date(a.run.createdDate).getTime()
    );

    const stageMap = new Map<
      string,
      { stage: TimelineRecord; detail: PipelineRun; runUrl: string }
    >();

    for (const { run, detail, stages } of sorted) {
      for (const stage of stages) {
        if (!stageMap.has(stage.identifier)) {
          stageMap.set(stage.identifier, {
            stage,
            detail,
            runUrl: this.webPipelineRunUrl(config, run.id),
          });
        }
      }
    }

    return stageMap;
  }

  /**
   * For each entry in the stage map, resolves the referenced build artifact
   * (pipeline resource) and returns a flat array of DeploymentStageInfo.
   */
  private resolveBuildInfo(
    config: PipelineConfig,
    stageMap: Map<
      string,
      { stage: TimelineRecord; detail: PipelineRun; runUrl: string }
    >
  ): Observable<DeploymentStageInfo[]> {
    if (stageMap.size === 0) {
      return of([]);
    }

    // Collect unique build IDs to avoid duplicate fetches.
    const buildCache = new Map<number, Observable<BuildInfo | null>>();

    const getOrFetchBuild = (buildId: number): Observable<BuildInfo | null> => {
      if (!buildCache.has(buildId)) {
        buildCache.set(buildId, this.getBuild(config, buildId));
      }
      return buildCache.get(buildId)!;
    };

    const entries = Array.from(stageMap.entries());

    const infos$ = entries.map(([, { stage, detail, runUrl }]) => {
      const firstPipelineResource = this.extractFirstPipelineResource(detail);

      const build$: Observable<BuildInfo | null> = firstPipelineResource
        ? firstPipelineResource.runId
          ? getOrFetchBuild(firstPipelineResource.runId)
          : of(null)
        : of(null);

      return build$.pipe(
        map((build) =>
          this.toDeploymentStageInfo(
            config,
            stage,
            detail,
            runUrl,
            firstPipelineResource,
            build
          )
        )
      );
    });

    return forkJoin(infos$).pipe(
      map((results) =>
        results.sort(
          (a, b) =>
            new Date(b.startTime ?? 0).getTime() -
            new Date(a.startTime ?? 0).getTime()
        )
      )
    );
  }

  private extractFirstPipelineResource(
    run: PipelineRun
  ): ResolvedPipelineResource | null {
    const pipelines = run.resources?.pipelines;
    if (!pipelines) return null;
    const resources = Object.values(pipelines);
    if (resources.length === 0) return null;

    for (const resource of resources) {
      const resolved = this.resolvePipelineResource(resource);
      if (resolved) {
        return resolved;
      }
    }

    this.logError(
      'Malformed pipeline resource: missing required run metadata (id or name).',
      null,
      { runId: run.id }
    );
    return null;
  }

  private resolvePipelineResource(resource: unknown): ResolvedPipelineResource | null {
    if (!resource || typeof resource !== 'object') return null;
    const candidate = resource as {
      pipeline?: { name?: unknown };
      run?: { id?: unknown; name?: unknown; uri?: unknown; url?: unknown };
      runID?: unknown;
      runId?: unknown;
      runUri?: unknown;
      runURI?: unknown;
      runName?: unknown;
      version?: unknown;
      url?: unknown;
      webUrl?: unknown;
      _links?: { web?: { href?: unknown } };
    };

    const pipelineName =
      typeof candidate.pipeline?.name === 'string' && candidate.pipeline.name.length > 0
        ? candidate.pipeline.name
        : null;
    const runId =
      this.toPositiveInteger(candidate.run?.id) ??
      this.toPositiveInteger(candidate.runID) ??
      this.toPositiveInteger(candidate.runId) ??
      this.extractRunIdFromReference(candidate.run?.uri) ??
      this.extractRunIdFromReference(candidate.run?.url) ??
      this.extractRunIdFromReference(candidate.runUri) ??
      this.extractRunIdFromReference(candidate.runURI);
    // Azure DevOps pipeline resource payloads sometimes expose the consumed run label as `version`.
    const runNameCandidates = [candidate.run?.name, candidate.runName, candidate.version];
    const runName = runNameCandidates.find(
      (value): value is string => typeof value === 'string' && value.length > 0
    ) ?? null;
    const webUrlCandidates = [candidate.webUrl, candidate.url, candidate._links?.web?.href];
    const webUrl = webUrlCandidates.find(
      (value): value is string => typeof value === 'string' && value.length > 0
    ) ?? null;

    if (!pipelineName && !runId && !runName && !webUrl) {
      return null;
    }

    return {
      pipelineName,
      runId,
      runName,
      webUrl,
    };
  }

  private extractRunIdFromReference(value: unknown): number | null {
    if (typeof value !== 'string' || value.length === 0) return null;

    const direct = this.toPositiveInteger(value);
    if (direct) return direct;

    const patterns = [
      /(?:[?&]buildId=|\/builds\/|\/runs\/)(\d+)(?:[/?#&]|$)/i,
      /vstfs:\/\/\/Build\/Build\/(\d+)(?:[/?#]|$)/i,
    ];

    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (!match || !match[1]) continue;
      const parsed = this.toPositiveInteger(match[1]);
      if (parsed) return parsed;
    }

    return null;
  }

  private toPositiveInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }
    if (
      typeof value === 'string' &&
      value.length > 0 &&
      /^\d+$/.test(value)
    ) {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }
    return null;
  }

  private toDeploymentStageInfo(
    config: PipelineConfig,
    stage: TimelineRecord,
    detail: PipelineRun,
    runUrl: string,
    resource: ResolvedPipelineResource | null,
    build: BuildInfo | null
  ): DeploymentStageInfo {
    const buildRunId = resource?.runId ?? null;
    const commitId = build?.sourceVersion ?? null;
    const buildId = this.toPositiveInteger(build?.id);
    const buildUrl = buildId
      ? this.webPipelineRunUrl(config, buildId)
      : resource?.webUrl ??
        (buildRunId ? this.webPipelineRunUrl(config, buildRunId) : null);
    return {
      stageName: stage.name,
      stageIdentifier: stage.identifier,
      runId: detail.id,
      runName: detail.name,
      runState: stage.state,
      runResult: stage.result,
      runUrl,
      startTime: stage.startTime,
      finishTime: stage.finishTime,
      buildPipelineName: resource?.pipelineName ?? null,
      buildRunId,
      buildUrl,
      buildNumber: build?.buildNumber ?? resource?.runName ?? null,
      commitId: commitId,
      commitShort: commitId ? commitId.substring(0, 8) : null,
      sourceBranch: build?.sourceBranch
        ? build.sourceBranch.replace(/^refs\/heads\//, '')
        : null,
      repositoryName: build?.repository?.name ?? null,
      requestedFor: build?.requestedFor?.displayName ?? null,
    };
  }
}
