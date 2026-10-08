import type {
  FileLike,
  FileSelectionConstraints,
  FileSelectionResult,
  FileValidationIssue,
  RejectedFile
} from './file-types';

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index).toLowerCase() : '';
}

function acceptsFile(file: FileLike, accept: readonly string[] | undefined): boolean {
  if (!accept?.length) return true;
  const extension = extensionOf(file.name);
  const mime = file.type.toLowerCase();

  return accept.some((rule) => {
    const normalized = rule.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized.startsWith('.')) return extension === normalized;
    if (normalized.endsWith('/*')) return mime.startsWith(normalized.slice(0, -1));
    return mime === normalized;
  });
}

export function validateFileSelection<TFile extends FileLike>(
  files: readonly TFile[],
  constraints: FileSelectionConstraints = {}
): FileSelectionResult<TFile> {
  const maxFiles = Math.max(1, Math.floor(constraints.maxFiles ?? Number.POSITIVE_INFINITY));
  const accepted: TFile[] = [];
  const rejected: RejectedFile<TFile>[] = [];
  const globalIssues: FileValidationIssue[] = [];

  if (files.length > maxFiles) {
    globalIssues.push({
      code: 'too-many-files',
      message: `最多选择 ${maxFiles} 个文件`
    });
  }

  files.forEach((file, index) => {
    const issues: FileValidationIssue[] = [];
    if (index >= maxFiles) {
      issues.push({ code: 'too-many-files', message: '超过允许的文件数量', fileName: file.name });
    }
    if (constraints.maxSizeBytes !== undefined && file.size > constraints.maxSizeBytes) {
      issues.push({ code: 'file-too-large', message: '文件大小超过限制', fileName: file.name });
    }
    if (!acceptsFile(file, constraints.accept)) {
      issues.push({ code: 'file-type-not-allowed', message: '文件类型不被允许', fileName: file.name });
    }

    if (issues.length) rejected.push({ file, issues });
    else accepted.push(file);
  });

  return { accepted, rejected, issues: globalIssues };
}
