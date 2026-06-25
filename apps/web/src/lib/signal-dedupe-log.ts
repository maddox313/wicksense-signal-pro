export function logDuplicateSignalBlocked(params: {
  slot: string;
  symbol: string;
  timeframe: string;
  strategy: string;
  side: string;
  barTime: number;
  signalId: string;
}): void {
  console.info(
    `duplicate blocked: ${params.slot}, ${params.symbol}, ${params.timeframe}, ${params.strategy}, ${params.side}, ${params.barTime}, ${params.signalId}`
  );
}
