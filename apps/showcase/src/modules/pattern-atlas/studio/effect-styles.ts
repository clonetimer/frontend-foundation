/** Shared between the live canvas and exported React source. Effect selectors are scoped to .atlas-fx. */
export const studioEffectStyles = `
.atlas-fx{position:relative;min-width:0;transition:box-shadow .22s ease,transform .22s ease,border-color .22s ease;--atlas-duration:var(--pa-fx-duration,440ms);--atlas-easing:cubic-bezier(.2,.7,.25,1)}
.atlas-fx>*{min-width:0}
.atlas-fx[data-effect="fade-up"]{animation:atlasFadeUp var(--atlas-duration) var(--atlas-easing) both}
.atlas-fx[data-effect="slide-reveal"]{animation:atlasSlideReveal var(--atlas-duration) var(--atlas-easing) both}
.atlas-fx[data-effect="stagger"]>*,.atlas-fx[data-effect="stagger"] .pa-studio-layout>.pa-studio-node,.atlas-fx[data-effect="stagger"] .atlas-export-stack>.atlas-export-node{animation:atlasFadeUp var(--atlas-duration) both}
.atlas-fx[data-effect="stagger"]>*:nth-child(2),.atlas-fx[data-effect="stagger"] .pa-studio-layout>.pa-studio-node:nth-child(2),.atlas-fx[data-effect="stagger"] .atlas-export-stack>.atlas-export-node:nth-child(2){animation-delay:90ms}
.atlas-fx[data-effect="stagger"]>*:nth-child(3),.atlas-fx[data-effect="stagger"] .pa-studio-layout>.pa-studio-node:nth-child(3),.atlas-fx[data-effect="stagger"] .atlas-export-stack>.atlas-export-node:nth-child(3){animation-delay:170ms}
.atlas-fx[data-effect="typewriter"]{animation:atlasFadeUp var(--atlas-duration) both}
.atlas-fx[data-effect="typewriter"] strong,.atlas-fx[data-effect="typewriter"] p,.atlas-fx[data-effect="typewriter"] h2,.atlas-fx[data-effect="typewriter"] h3,.atlas-fx[data-effect="typewriter"] .ant-typography{display:inline-block;overflow:hidden;white-space:nowrap;max-width:100%;animation:atlasTypewriter 1.6s steps(25,end) both}
.atlas-fx[data-effect="hover-lift"]:hover,.atlas-fx[data-effect="hover-lift"]:focus-within{transform:translateY(-5px);filter:drop-shadow(0 6px 10px rgba(24,44,41,.09))}
.atlas-fx[data-effect="tilt"]{transform:perspective(800px) rotateX(var(--atlas-rotate-x,0deg)) rotateY(var(--atlas-rotate-y,0deg))}
.atlas-fx[data-effect="spotlight"]:hover:after{content:'';position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:radial-gradient(210px circle at var(--atlas-pointer-x,50%) var(--atlas-pointer-y,50%),rgba(93,191,159,.19),transparent 75%)}
.atlas-fx[data-effect="shine"]{overflow:hidden}
.atlas-fx[data-effect="shine"]:after{content:'';position:absolute;inset:-75% auto -75% -125%;width:52%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.68),transparent);transform:rotate(20deg);pointer-events:none}
.atlas-fx[data-effect="shine"]:hover:after{animation:atlasShine .78s ease-out both}
.atlas-fx[data-effect="flip"]{transform-style:preserve-3d}
.atlas-fx[data-effect="flip"].atlas-active{transform:perspective(800px) rotateY(5deg);box-shadow:inset 0 0 0 2px var(--pa-fx-accent,#11765c)}
.atlas-fx[data-effect="ripple"]:active{animation:atlasTap .32s ease-out}
.atlas-fx[data-effect="morph-toggle"].atlas-active{transform:scale(1.015);filter:saturate(1.2)}
.atlas-fx[data-effect="success-check"].atlas-active:after{content:'✓';position:absolute;right:6px;top:-10px;font-size:22px;color:#13845f;animation:atlasFadeUp .45s both;pointer-events:none}
.atlas-fx[data-effect="progress-ring"]:before{content:'';position:absolute;width:9px;height:9px;right:5px;top:5px;border:2px solid var(--pa-fx-accent,#11765c);border-top-color:transparent;border-radius:50%;animation:atlasSpin 1s linear infinite}
.atlas-fx[data-effect="gradient-flow"]{background-image:linear-gradient(110deg,#e7f8ee,#eef5ff,#f8ecf5,#e7f8ee);background-size:280% 280%;animation:atlasGradient 8s ease infinite;border-radius:12px}
.atlas-fx[data-effect="floating-orbs"]:before,.atlas-fx[data-effect="floating-orbs"]:after{content:'';position:absolute;z-index:0;width:35px;height:35px;border-radius:50%;background:rgba(69,156,131,.15);right:14px;top:2px;pointer-events:none;animation:atlasFloat 5s ease-in-out infinite}
.atlas-fx[data-effect="floating-orbs"]:after{right:56px;top:auto;bottom:0;width:20px;height:20px;animation-delay:1.3s}
.atlas-fx[data-effect="floating-orbs"]>*{position:relative;z-index:1}
.atlas-fx[data-effect="skeleton-wave"]{background:linear-gradient(100deg,transparent 15%,rgba(194,204,200,.45) 46%,transparent 82%);background-size:250% 100%;animation:atlasShimmer 2.8s linear infinite}
.atlas-fx[data-effect="ticker"]{overflow:hidden}
.atlas-fx[data-effect="ticker"]>*{animation:atlasTicker 7s ease-in-out infinite alternate}
.atlas-fx[data-effect="scroll-progress"]{border-top:3px solid var(--pa-fx-accent,#11765c)}
.atlas-fx[data-effect="scroll-progress"]:before{content:'';position:absolute;top:-3px;left:0;width:var(--atlas-progress,36%);height:3px;background:#84ddaa}
@keyframes atlasFadeUp{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:translateY(0)}}
@keyframes atlasSlideReveal{from{opacity:.3;clip-path:inset(0 100% 0 0)}to{opacity:1;clip-path:inset(0 0 0 0)}}
@keyframes atlasTypewriter{from{max-width:0}to{max-width:100%}}
@keyframes atlasShine{from{left:-125%}to{left:150%}}
@keyframes atlasTap{50%{filter:brightness(.9);transform:scale(.98)}}
@keyframes atlasSpin{to{transform:rotate(360deg)}}
@keyframes atlasGradient{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes atlasFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-9px)}}
@keyframes atlasShimmer{to{background-position:-250% 0}}
@keyframes atlasTicker{from{transform:translateX(0)}to{transform:translateX(16px)}}
@media (prefers-reduced-motion:reduce){.atlas-fx,.atlas-fx:before,.atlas-fx:after,.atlas-fx>*{animation:none!important;transition:none!important;transform:none!important}}
.atlas-no-motion .atlas-fx,.atlas-no-motion .atlas-fx:before,.atlas-no-motion .atlas-fx:after,.atlas-no-motion .atlas-fx>*{animation:none!important;transition:none!important;transform:none!important}
`;
