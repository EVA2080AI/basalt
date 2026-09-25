import type { Product } from "./types.js";
import { urlMetadataProduct } from "../projects/url-metadata/product.js";
import { domainCheckProduct } from "../projects/domain-check/product.js";
import { emailCheckProduct } from "../projects/email-check/product.js";
import { htmlToMarkdownProduct } from "../projects/html-to-markdown/product.js";
import { qrcodeProduct } from "../projects/qrcode/product.js";
import { pdfExtractProduct } from "../projects/pdf-extract/product.js";
import { sslCheckProduct } from "../projects/ssl-check/product.js";
import { languageDetectProduct } from "../projects/language-detect/product.js";
import { jsonValidateProduct } from "../projects/json-validate/product.js";
import { verifySignatureProduct } from "../projects/verify-signature/product.js";
import { financialIdCheckProduct } from "../projects/financial-id-check/product.js";
import { geoDistanceProduct } from "../projects/geo-distance/product.js";
import { markdownToHtmlProduct } from "../projects/markdown-to-html/product.js";
import { timezoneConvertProduct } from "../projects/timezone-convert/product.js";
import { tokenCountProduct } from "../projects/token-count/product.js";
import { hashDigestProduct } from "../projects/hash-digest/product.js";
import { jwtDecodeProduct } from "../projects/jwt-decode/product.js";
import { urlParseProduct } from "../projects/url-parse/product.js";
import { ethAddressProduct } from "../projects/eth-address/product.js";
import { ipCheckProduct } from "../projects/ip-check/product.js";
import { x402DiscoverProduct } from "../projects/x402-discover/product.js";
import { pageBuildProduct } from "../projects/page-build/product.js";

/**
 * El catálogo. Un producto = un archivo en `src/projects/<id>/product.ts`, más
 * una línea acá.
 *
 * Vivía dentro de `src/server.ts`, que había llegado a 497 líneas haciendo ocho
 * trabajos distintos — era el archivo que cualquier cambio obligaba a tocar.
 * Separarlo permite testear el catálogo entero sin levantar un servidor.
 */
export const PRODUCTS: Product[] = [
  urlMetadataProduct,
  domainCheckProduct,
  emailCheckProduct,
  htmlToMarkdownProduct,
  qrcodeProduct,
  pdfExtractProduct,
  sslCheckProduct,
  languageDetectProduct,
  jsonValidateProduct,
  verifySignatureProduct,
  financialIdCheckProduct,
  geoDistanceProduct,
  markdownToHtmlProduct,
  timezoneConvertProduct,
  tokenCountProduct,
  hashDigestProduct,
  jwtDecodeProduct,
  urlParseProduct,
  ethAddressProduct,
  ipCheckProduct,
  x402DiscoverProduct,
  pageBuildProduct,
];
