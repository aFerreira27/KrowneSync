const loadFonts = async (): Promise<{ [key: string]: ArrayBuffer }> => {
  const fontFileNames = [
    'HelveticaNeueLTStd-Bd',
    'HelveticaNeueLTStd-BdCn',
    'HelveticaNeueLTStd-Hv',
    'HelveticaNeueLTStd-HvCn',
    'HelveticaNeueLTStd-Lt',
    'HelveticaNeueLTStd-LtCnO',
    'HelveticaNeueLTStd-Md',
    'HelveticaNeueLTStd-MdCnO',
    'HelveticaNeueLTStd-Roman',
    'HelveticaNeueLTStd-Th',
    'HelveticaNeueLTStd-UltLt',
  ];

  const fontPromises = fontFileNames.map(async (name) => {
    try {
      const response = await fetch(`/fonts/${name}.otf`);
      if (!response.ok) {
        console.warn(`Could not load font: ${name}.otf. File not found.`);
        return null;
      }
      const fontData = await response.arrayBuffer();
      return { name, data: fontData };

    } catch (error) {
      console.error(`An error occurred while fetching font ${name}:`, error);
      return null;
    }
  });

  const fontDataArray = await Promise.all(fontPromises);
  
  const fonts: { [key: string]: ArrayBuffer } = {};
  fontDataArray.forEach(font => {
    if (font) {
      fonts[font.name] = font.data;
    }
  });

  return fonts;
};

export default loadFonts;
