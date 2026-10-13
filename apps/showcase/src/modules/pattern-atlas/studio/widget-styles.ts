/** Shared stylesheet for Studio rich widgets in standalone React export. */
export const studioWidgetStyles = `
.pa-studio-rich{display:flex;flex-direction:column;gap:12px;min-width:0}
.pa-studio-rich>strong{font-size:13px;color:var(--atlas-ink,#2b4336)}
.pa-studio-rich-list{margin:2px 0;padding-left:20px;line-height:1.9;font-size:13px}
.pa-studio-rich-image{display:block;width:100%;max-height:300px;object-fit:cover;border-radius:10px}
.pa-studio-rich-image-placeholder{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;min-height:124px;background:linear-gradient(140deg,#eaf3ee,#dbeae1);border-radius:10px;color:#6e907c;font-size:14px}
.pa-studio-rich-image-placeholder small{font-size:10px}
.pa-studio-mini-chart{display:flex;gap:9px;height:132px;align-items:end;padding:12px 9px 5px;border:1px solid #e4ece6;border-radius:10px}
.pa-studio-mini-chart>div{height:100%;flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:end;gap:7px}
.pa-studio-mini-chart i{display:block;width:90%;max-width:50px;background:linear-gradient(180deg,#37b287,#137b60);border-radius:5px 5px 0 0}
.pa-studio-mini-chart small{font-size:10px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pa-studio-record-pager,.atlas-record-pager{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;padding-top:9px;color:#678673}
.pa-studio-record-error,.atlas-record-error{display:block;color:#b62828;font-size:11px;margin-top:4px}
.atlas-export-node .ant-table-wrapper{width:100%;overflow-x:auto}
.atlas-export-node .ant-steps{overflow-x:auto;max-width:100%}

.pa-studio-widget-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:#648071}
.pa-studio-widget-actions small{color:#769184}
.pa-studio-file{padding:12px;border:1px dashed #c6ddd0;border-radius:10px}
.pa-studio-file input[type=file]{max-width:100%;font-size:12px}
.pa-studio-file-list{display:flex;flex-direction:column;gap:6px}
.pa-studio-file-list>div{display:flex;gap:9px;justify-content:space-between;padding:9px 10px;background:#f3f8f5;border:1px solid #e2ece5;border-radius:8px;font-size:12px}
.pa-studio-file-list small{white-space:nowrap;color:#748b7d}
.pa-studio-task{border:1px solid #e0eae4;padding:12px;border-radius:10px}
.pa-studio-async-log{margin:0;padding-left:25px;display:flex;flex-direction:column;gap:10px}
.pa-studio-async-log li{font-size:12px;padding:5px 3px}
.pa-studio-async-log li .ant-tag{margin-left:10px}
.pa-studio-line-visual{display:block;width:100%;height:auto;max-height:185px;color:#6e8377}
.pa-studio-donut{height:150px;width:150px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center}
.pa-studio-donut>div{background:var(--atlas-panel,#fff);height:114px;width:114px;border-radius:50%;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:4px}
.pa-studio-donut>div strong{font-size:27px;color:#17785b}
.pa-studio-donut>div small{font-size:11px;color:#82988a}
.pa-studio-heatmap{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:5px}
.pa-studio-heatmap span{aspect-ratio:1;border-radius:5px;border:1px solid rgba(60,100,75,.08)}
.pa-studio-workflow-step{border:1px solid #dce9df;background:#fcfefc;border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px;margin-bottom:8px}
.pa-studio-workflow-step-head{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:12px;font-weight:700}
.pa-studio-workflow-line{height:14px;border-left:2px solid #9bc3aa;margin-left:14px}
.pa-studio-workflow-step button{max-width:100%}
.pa-studio-workflow-foot{font-size:11px;line-height:1.65;color:#70887a}
`;
