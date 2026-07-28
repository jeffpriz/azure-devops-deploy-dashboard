import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import {
  Observable,
  forkJoin,
  of,
  from,
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
  PipelineRun,
  PipelineResourceEntry,
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

const API_VERSION = '7.1';
const MAX_RUNS_TO_FETCH = 100;

@Injectable({ providedIn: 'root' })
export class AzureDevOpsService {
  private http = inject(HttpClient);

  private buildHeaders(pat: string): HttpHeaders {
    const encoded = btoa(':' + pat);
    return new HttpHeaders({
      Authorization: `Basic ${encoded}`,
    });
  }

  private normalizeOrgUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  private pipelinesApiBase(config: PipelineConfig): string {
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
      .pipe(map((res) => res.value));
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
    });
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
        catchError(() => of([] as TimelineRecord[]))
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
      .pipe(catchError(() => of(null)));
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
                  catchError(() => of(run as PipelineRun))
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
      switchMap((stageMap) => this.resolveBuildInfo(config, stageMap))
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
        ? getOrFetchBuild(firstPipelineResource.run.id)
        : of(null);

      return build$.pipe(
        map((build) =>
          this.toDeploymentStageInfo(
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
  ): PipelineResourceEntry | null {
    const pipelines = run.resources?.pipelines;
    if (!pipelines) return null;
    const keys = Object.keys(pipelines);
    if (keys.length === 0) return null;
    return pipelines[keys[0]];
  }

  private toDeploymentStageInfo(
    stage: TimelineRecord,
    detail: PipelineRun,
    runUrl: string,
    resource: PipelineResourceEntry | null,
    build: BuildInfo | null
  ): DeploymentStageInfo {
    const commitId = build?.sourceVersion ?? null;
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
      buildPipelineName: resource?.pipeline.name ?? null,
      buildRunId: resource?.run.id ?? null,
      buildNumber: build?.buildNumber ?? resource?.run.name ?? null,
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
