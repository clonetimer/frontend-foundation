import { Alert, Button, Card, Flex, Typography } from 'antd';
import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import type { FileSelectionConstraints, FileSelectionResult, FileValidationIssue } from './file-types';
import { validateFileSelection } from './validate-file-selection';

export interface FileDropZoneProps {
  constraints?: FileSelectionConstraints;
  multiple?: boolean;
  disabled?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  onSelection(result: FileSelectionResult<File>): void;
}

function flattenIssues(result: FileSelectionResult<File>): FileValidationIssue[] {
  return [...result.issues, ...result.rejected.flatMap((item) => item.issues)];
}

export function FileDropZone({
  constraints,
  multiple = true,
  disabled = false,
  title = '拖放文件到此处',
  description = '或点击选择本地文件',
  onSelection
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [issues, setIssues] = useState<readonly FileValidationIssue[]>([]);
  const effectiveConstraints: FileSelectionConstraints = {
    ...constraints,
    ...(!multiple ? { maxFiles: 1 } : {})
  };

  const handleFiles = (files: readonly File[]) => {
    const result = validateFileSelection(files, effectiveConstraints);
    setIssues(flattenIssues(result));
    onSelection(result);
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(Array.from(event.currentTarget.files ?? []));
    event.currentTarget.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    handleFiles(Array.from(event.dataTransfer.files));
  };

  return (
    <div>
      <Card
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
        style={{ borderStyle: 'dashed', textAlign: 'center', opacity: disabled ? 0.6 : 1 }}
      >
        <Flex vertical align="center" gap={8}>
          <Typography.Text strong>{title}</Typography.Text>
          <Typography.Text type="secondary">{description}</Typography.Text>
          <Button disabled={disabled} onClick={() => inputRef.current?.click()}>选择文件</Button>
          <input
            ref={inputRef}
            type="file"
            hidden
            disabled={disabled}
            multiple={multiple}
            accept={constraints?.accept?.join(',')}
            onChange={handleInput}
          />
        </Flex>
      </Card>
      {issues.length ? (
        <Alert
          style={{ marginTop: 12 }}
          type="warning"
          showIcon
          message="部分文件未通过校验"
          description={<ul style={{ margin: 0, paddingInlineStart: 20 }}>{issues.map((issue, index) => <li key={`${issue.code}-${issue.fileName ?? 'global'}-${index}`}>{issue.fileName ? `${issue.fileName}: ` : ''}{issue.message}</li>)}</ul>}
        />
      ) : null}
    </div>
  );
}
