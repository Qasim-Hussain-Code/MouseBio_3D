/// <reference lib="webworker" />
import { inflateRaw, sectionTextureSize, setGreyVolume, setLabelMask, setPhotographPlane, type Dimensions, type SectionLayer, type SectionLabels } from '../domain/section-images';

interface BuildRequest { type: 'build'; layer: SectionLayer; labels: SectionLabels; image: ArrayBuffer; labelStream: ArrayBuffer; dimensions: Dimensions }

/** Decode one image layer into a downsampled RGBA volume whose alpha marks the labelled body. */
self.onmessage = async (event: MessageEvent<BuildRequest>) => {
  const { type, layer, labels, image, labelStream, dimensions } = event.data ?? {};
  if (type !== 'build') return;
  try {
    const [width, height, depth] = sectionTextureSize(dimensions);
    const volume = new Uint8Array(width * height * depth * 4);
    if (layer.format === 'jpeg-slices-v1') {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('This browser cannot decode the section images.');
      context.imageSmoothingQuality = 'high';
      const bytes = new Uint8Array(image);
      for (let z = 0; z < depth; z++) {
        const [offset, length] = layer.slices[z];
        const bitmap = await createImageBitmap(new Blob([bytes.subarray(offset, offset + length)], { type: 'image/jpeg' }));
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        setPhotographPlane(volume, context.getImageData(0, 0, width, height).data, z, [width, height, depth]);
        if (z % 16 === 15) self.postMessage({ type: 'progress', fraction: (z + 1) / depth });
      }
    } else {
      setGreyVolume(volume, await inflateRaw(image, layer.expandedBytes), dimensions);
    }
    setLabelMask(volume, await inflateRaw(labelStream, labels.expandedBytes), dimensions);
    self.postMessage({ type: 'result', volume }, [volume.buffer as ArrayBuffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'The section images could not be prepared.' });
  }
};
