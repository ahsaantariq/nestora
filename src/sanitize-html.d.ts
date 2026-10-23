declare module "sanitize-html" {
  interface IOptions {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    allowedStyles?: Record<string, Record<string, RegExp[]>>;
    allowedSchemes?: string[];
  }
  interface Sanitize {
    (html: string, options?: IOptions): string;
    defaults: { allowedTags: string[]; allowedAttributes: Record<string, string[]> };
  }
  const sanitizeHtml: Sanitize;
  export default sanitizeHtml;
}
