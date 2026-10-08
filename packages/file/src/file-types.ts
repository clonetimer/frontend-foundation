export interface FileLike {
  name: string;
  size: number;
  type: string;
}

export interface FileSelectionConstraints {
  accept?: readonly string[];
  maxFiles?: number;
  maxSizeBytes?: number;
}

export type FileValidationCode =
  | 'too-many-files'
  | 'file-too-large'
  | 'file-type-not-allowed';

export interface FileValidationIssue {
  code: FileValidationCode;
  message: string;
  fileName?: string;
}

export interface RejectedFile<TFile extends FileLike = FileLike> {
  file: TFile;
  issues: readonly FileValidationIssue[];
}

export interface FileSelectionResult<TFile extends FileLike = FileLike> {
  accepted: readonly TFile[];
  rejected: readonly RejectedFile<TFile>[];
  issues: readonly FileValidationIssue[];
}

export type FileTransferStatus = 'pending' | 'transferring' | 'success' | 'failed' | 'cancelled';

export interface FileTransferItem {
  id: string;
  name: string;
  sizeBytes?: number;
  status: FileTransferStatus;
  progress?: number;
  message?: string;
}
