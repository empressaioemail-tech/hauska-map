import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DownloadFileButton,
  downloadFormatLabel,
  formatByteCount,
} from "./DownloadFileButton";

describe("downloadFormatLabel", () => {
  it("maps known formats to the 4a short names", () => {
    expect(downloadFormatLabel("pdf-site-plan")).toBe("PDF");
    expect(downloadFormatLabel("pdf-flood-drainage")).toBe("PDF");
    expect(downloadFormatLabel("dxf-site-plan")).toBe("DXF");
    expect(downloadFormatLabel("glb")).toBe("GLB");
    expect(downloadFormatLabel("ifc")).toBe("IFC4");
  });

  it("does not invent a pretty name for an unknown format", () => {
    expect(downloadFormatLabel("landxml-tin")).toBe("landxml-tin");
  });
});

describe("formatByteCount", () => {
  it("paints KB from a real byteCount and omits missing or non-positive", () => {
    expect(formatByteCount(204800)).toBe("200 KB");
    expect(formatByteCount(1_468_006)).toBe("1.4 MB");
    expect(formatByteCount(null)).toBeNull();
    expect(formatByteCount(0)).toBeNull();
    expect(formatByteCount(-12)).toBeNull();
  });
});

describe("DownloadFileButton", () => {
  it("ready state is an outlined anchor, not a blue text link", () => {
    const html = renderToStaticMarkup(
      <DownloadFileButton
        href="/dl"
        download="x.pdf"
        label="Download PDF"
        sizeLabel="200 KB"
        testId="site-plan-download-link"
      />,
    );
    expect(html).toContain('data-testid="site-plan-download-link"');
    expect(html).toContain("Download PDF");
    expect(html).toContain("200 KB");
    expect(html).toContain("<a ");
    expect(html).toContain("text-decoration:none");
    expect(html).not.toContain("Download pdf-site-plan");
  });

  it("without href is not a navigable link", () => {
    const html = renderToStaticMarkup(
      <DownloadFileButton
        label="Download PDF"
        state="generating"
        testId="site-plan-download-link"
      />,
    );
    expect(html).toContain("Generating sheet");
    expect(html).not.toContain("<a ");
  });
});
