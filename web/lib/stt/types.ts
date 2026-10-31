export type Segment = {
  speaker: string;
  start: number; // seconds from start of recording
  end: number;
  text: string;
};

export type RawSegment = {
  start: number; // seconds relative to the file passed to transcribe()
  end: number;
  text: string;
  /** Provider diarization index (0-based), when the provider supports it. */
  speaker?: string;
};

export interface SttProvider {
  name: string;
  /** Transcribes ONE short mono audio file. */
  transcribe(file: string): Promise<RawSegment[]>;
}
