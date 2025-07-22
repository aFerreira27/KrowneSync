const loadFonts = async () => {
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
      const fontObject: { [key: string]: any } = { data: fontData };

      if (name === 'HelveticaNeueLTStd-Roman') {
        fontObject.fallback = true;
      }

      return { [name]: fontObject };

    } catch (error) {
      console.error(`An error occurred while fetching font ${name}:`, error);
      return null;
    }
  });

  const fontDataArray = await Promise.all(fontPromises);
  return Object.assign({}, ...fontDataArray.filter(Boolean));
};