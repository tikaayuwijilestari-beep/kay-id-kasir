/// <reference types="@cloudflare/workers-types" />

declare module '*.sql?raw' {
  const content: string;
  export default content;
}

declare module '*.sql' {
  const content: string;
  export default content;
}
