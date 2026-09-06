import {CloudTasksClient} from '@google-cloud/tasks';

export const LOOKUP_TASK_REGION = 'us-east4';
export const LOOKUP_TASK_QUEUE = 'lookup-runs';

export type LookupRunTask = Readonly<{
  runId: string;
  numberKey: string;
}>;

export function getLookupQueuePath(projectId: string): string {
  const client = new CloudTasksClient();
  return client.queuePath(projectId, LOOKUP_TASK_REGION, LOOKUP_TASK_QUEUE);
}
