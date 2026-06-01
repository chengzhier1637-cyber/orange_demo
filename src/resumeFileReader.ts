export async function extractResumeFileContent(file: File) {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith('.txt')) {
    const content = await file.text();

    return content.trim() ? content : createFallbackResumeContent(file.name);
  }

  try {
    if (fileName.endsWith('.pdf')) {
      const content = await extractPdfText(file);

      if (content.trim()) {
        return content;
      }
    }

    if (fileName.endsWith('.docx')) {
      const content = await extractDocxText(file);

      if (content.trim()) {
        return content;
      }
    }
  } catch {
    return createFallbackResumeContent(file.name);
  }

  return createFallbackResumeContent(file.name);
}

export function isLikelyUnreadablePdfContent(content: string) {
  const meaningfulText = content
    .replace(/姓名|标题|简介|技能|经历|教育|未命名候选人/g, '')
    .replace(/\s/g, '');

  return meaningfulText.length < 20;
}

export function createFallbackResumeContent(fileName: string) {
  const fileTitle = fileName.replace(/\.(pdf|docx)$/i, '').replace(/[-_]/g, ' ').trim();
  const [fallbackName = '未命名候选人', ...titleParts] = fileTitle.split(/\s+/);
  const fallbackTitle = titleParts.join(' ').replace(/简历$/i, '').trim();

  return `
    姓名：${fallbackName}
    标题：${fallbackTitle}
    简介：
    技能：
    经历：
    教育：
  `;
}

interface PdfTextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
}

export function rebuildPdfPageText(items: unknown[]) {
  const textItems = items
    .map((item) => {
      const textItem = item as PdfTextItemLike;

      return {
        text: textItem.str?.trim() ?? '',
        x: textItem.transform?.[4] ?? 0,
        y: textItem.transform?.[5] ?? 0,
        width: textItem.width ?? 0,
      };
    })
    .filter((item) => item.text);

  const lines = textItems
    .sort((a, b) => (Math.abs(b.y - a.y) > 4 ? b.y - a.y : a.x - b.x))
    .reduce<PdfTextItemLike[][]>((groupedLines, item) => {
      const currentLine = groupedLines.at(-1);
      const currentLineY = currentLine?.[0]?.transform?.[5] ?? 0;

      if (!currentLine || Math.abs((item.y ?? 0) - currentLineY) > 4) {
        groupedLines.push([{
          str: item.text,
          transform: [1, 0, 0, 1, item.x, item.y],
          width: item.width,
        }]);
        return groupedLines;
      }

      currentLine.push({
        str: item.text,
        transform: [1, 0, 0, 1, item.x, item.y],
        width: item.width,
      });
      return groupedLines;
    }, []);

  return lines
    .map((line) => line
      .sort((a, b) => ((a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0)))
      .map((item, index, lineItems) => {
        if (index === 0) {
          return item.str ?? '';
        }

        const previousItem = lineItems[index - 1];
        const previousRight = (previousItem.transform?.[4] ?? 0) + (previousItem.width ?? 0);
        const gap = (item.transform?.[4] ?? 0) - previousRight;

        return `${gap > 12 ? ' ' : ''}${item.str ?? ''}`;
      })
      .join('')
      .trim())
    .filter(Boolean)
    .join('\n');
}

async function extractPdfText(file: File) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.mjs',
    import.meta.url,
  ).toString();

  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const pageText = rebuildPdfPageText(textContent.items);

    if (pageText) {
      pageTexts.push(pageText);
    }
  }

  return pageTexts.join('\n');
}

async function extractDocxText(file: File) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });

  return result.value;
}
