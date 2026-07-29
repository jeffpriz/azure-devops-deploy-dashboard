export interface PipelineConfig {
  organizationUrl: string;
  projectName: string;
  pipelineId: number | null;
  pat: string;
}

export interface PipelineSummary {
  id: number;
  name: string;
}

export interface PipelineRun {
  id: number;
  name: string;
  state: string;
  result: string | null;
  createdDate: string;
  finishedDate: string | null;
  resources?: {
    pipelines?: Record<string, unknown>;
    repositories?: Record<string, unknown>;
  };
}

export interface PipelineResourceEntry {
  pipeline: { id: number; name: string };
  run: { id: number; name: string };
}

export interface TimelineRecord {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  identifier: string;
  state: string;
  result: string | null;
  startTime: string | null;
  finishTime: string | null;
  order: number;
}

export interface BuildInfo {
  id: number;
  buildNumber: string;
  status: string;
  result: string;
  startTime: string;
  finishTime: string;
  sourceVersion: string;
  sourceBranch: string;
  definition: { id: number; name: string };
  repository: { id: string; name: string; type: string };
  requestedFor: { displayName: string; uniqueName: string };
}

export interface DeploymentStageInfo {
  stageName: string;
  stageIdentifier: string;
  stageOrder: number;
  runId: number;
  runName: string;
  runState: string;
  runResult: string | null;
  runUrl: string;
  startTime: string | null;
  finishTime: string | null;
  buildPipelineName: string | null;
  buildRunId: number | null;
  buildUrl: string | null;
  buildNumber: string | null;
  commitId: string | null;
  commitShort: string | null;
  sourceBranch: string | null;
  repositoryName: string | null;
  requestedFor: string | null;
}

export interface TabularStageCellInfo {
  stageIdentifier: string;
  stageName: string;
  stageOrder: number;
  runId: number;
  runName: string;
  runUrl: string;
  runState: string;
  runResult: string | null;
  startTime: string | null;
  finishTime: string | null;
  buildPipelineName: string | null;
  buildRunId: number | null;
  buildUrl: string | null;
  buildNumber: string | null;
  commitId: string | null;
  commitShort: string | null;
  sourceBranch: string | null;
  repositoryName: string | null;
  requestedFor: string | null;
}

export interface TabularPipelineData {
  pipelineId: number;
  pipelineName: string;
  stages: Record<string, TabularStageCellInfo>;
}
