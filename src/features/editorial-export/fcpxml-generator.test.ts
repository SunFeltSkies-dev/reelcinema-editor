import { describe, it, expect } from 'vite-plus/test'
import { composeFcpxml, escapeXml } from './fcpxml-generator'
import type { FcpxmlInput, FcpxmlScene } from './types'

function makeScene(overrides: Partial<FcpxmlScene> = {}): FcpxmlScene {
  return {
    sceneName: 'Scene 1',
    sceneId: 'scene-uuid-1',
    take: {
      assetId: 'asset-uuid-1',
      src: 'https://b2.example/master.mp4?sig=x',
      durationSeconds: 8,
      takeNumber: 1,
    },
    sixSlot: {
      camera: 'Camera holds steady, medium close-up.',
      action: 'The woman speaks.',
      identityDialogue: 'The woman in the image: "Hello."',
      delivery: 'Voice calm, measured.',
      preservation: 'Keep face, clothing, hair consistent.',
      audio: 'Quiet room tone, soft breath.',
    },
    ...overrides,
  }
}

describe('escapeXml', () => {
  it('escapes the five XML special characters', () => {
    expect(escapeXml('<a & b>')).toBe('&lt;a &amp; b&gt;')
    expect(escapeXml(`"single' & double"`)).toBe('&quot;single&apos; &amp; double&quot;')
  })

  it('returns the input unchanged when no escapes apply', () => {
    expect(escapeXml('plain text 123')).toBe('plain text 123')
  })
})

describe('composeFcpxml', () => {
  it('emits a valid FCPXML 1.10 header + DOCTYPE', () => {
    const input: FcpxmlInput = { projectName: 'My Project', scenes: [makeScene()] }
    const { xml } = composeFcpxml(input)
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true)
    expect(xml).toContain('<!DOCTYPE fcpxml>')
    expect(xml).toContain('<fcpxml version="1.10">')
    expect(xml.trimEnd().endsWith('</fcpxml>')).toBe(true)
  })

  it('emits a single 1080p24 format resource', () => {
    const { xml } = composeFcpxml({ projectName: 'P', scenes: [makeScene()] })
    expect(xml).toContain('name="FFVideoFormat1080p24"')
    expect(xml).toContain('frameDuration="1/24s"')
    expect(xml).toContain('width="1920"')
    expect(xml).toContain('height="1080"')
  })

  it('embeds the project name in both event and project elements (escaped)', () => {
    const { xml } = composeFcpxml({
      projectName: 'Heart & Soul',
      scenes: [makeScene()],
    })
    expect(xml).toContain('<event name="ReelCinema Export — Heart &amp; Soul">')
    expect(xml).toContain('<project name="Heart &amp; Soul">')
  })

  it('writes a media-rep with the signed source URL', () => {
    const scene = makeScene({
      take: {
        assetId: 'a',
        src: 'https://b2.example/master.mp4?expires=123&sig=abc',
        durationSeconds: 8,
        takeNumber: 1,
      },
    })
    const { xml } = composeFcpxml({ projectName: 'P', scenes: [scene] })
    expect(xml).toContain(
      '<media-rep kind="original-media" src="https://b2.example/master.mp4?expires=123&amp;sig=abc"/>',
    )
  })

  it('serializes the six-slot context as a clip note', () => {
    const { xml } = composeFcpxml({ projectName: 'P', scenes: [makeScene()] })
    expect(xml).toMatch(/<note>ReelCinema six-slot shot brief:\nCamera:[\s\S]*Audio:[\s\S]*<\/note>/)
  })

  it('escapes XML-unsafe characters inside the six-slot note', () => {
    const scene = makeScene({
      sixSlot: {
        camera: 'tracks <slowly> & smooth',
        action: 'a',
        identityDialogue: 'b',
        delivery: 'c',
        preservation: 'd',
        audio: 'e',
      },
    })
    const { xml } = composeFcpxml({ projectName: 'P', scenes: [scene] })
    expect(xml).toContain('Camera: tracks &lt;slowly&gt; &amp; smooth')
    expect(xml).not.toContain('Camera: tracks <slowly>')
  })

  it('places asset-clips on the spine in scene order with stacked offsets', () => {
    const scenes = [
      makeScene({ sceneName: 'S1', sceneId: 's1', take: { ...makeScene().take, durationSeconds: 8 } }),
      makeScene({ sceneName: 'S2', sceneId: 's2', take: { ...makeScene().take, durationSeconds: 4 } }),
      makeScene({ sceneName: 'S3', sceneId: 's3', take: { ...makeScene().take, durationSeconds: 6 } }),
    ]
    const { xml } = composeFcpxml({ projectName: 'P', scenes })
    expect(xml).toContain('<asset-clip name="S1"')
    expect(xml).toContain('offset="0/24s" duration="192/24s"')
    expect(xml).toContain('<asset-clip name="S2"')
    expect(xml).toContain('offset="192/24s" duration="96/24s"')
    expect(xml).toContain('<asset-clip name="S3"')
    expect(xml).toContain('offset="288/24s" duration="144/24s"')
  })

  it('rounds fractional seconds to the nearest frame', () => {
    const scene = makeScene({
      take: { ...makeScene().take, durationSeconds: 8.04 },
    })
    const { xml } = composeFcpxml({ projectName: 'P', scenes: [scene] })
    expect(xml).toContain('duration="193/24s"')
  })

  it('falls back to 8s when a take has non-positive duration', () => {
    const scene = makeScene({ take: { ...makeScene().take, durationSeconds: 0 } })
    const { xml } = composeFcpxml({ projectName: 'P', scenes: [scene] })
    expect(xml).toContain('duration="192/24s"')
  })

  it('skips scenes whose take has an empty src and reports them in the summary', () => {
    const sceneEmpty = makeScene({
      sceneName: 'Missing',
      sceneId: 's-missing',
      take: { ...makeScene().take, src: '' },
    })
    const sceneOk = makeScene({ sceneName: 'OK', sceneId: 's-ok' })
    const { xml, summary } = composeFcpxml({ projectName: 'P', scenes: [sceneEmpty, sceneOk] })
    expect(xml).toContain('<asset-clip name="OK"')
    expect(xml).not.toContain('<asset-clip name="Missing"')
    expect(summary.exportedSceneCount).toBe(1)
    expect(summary.skippedScenes).toEqual([
      { sceneId: 's-missing', sceneName: 'Missing', reason: 'first-take-not-rendered' },
    ])
    expect(summary.totalScenesConsidered).toBe(2)
  })

  it('emits a valid empty-spine document when no scenes are present', () => {
    const { xml, summary } = composeFcpxml({ projectName: 'Empty', scenes: [] })
    expect(xml).toContain('<spine>\n          </spine>')
    expect(xml).toContain('duration="1/24s"')
    expect(summary.exportedSceneCount).toBe(0)
    expect(summary.totalScenesConsidered).toBe(0)
  })

  it('escapes scene names with special characters', () => {
    const scene = makeScene({ sceneName: 'INT. PUB <NIGHT> & FOG' })
    const { xml } = composeFcpxml({ projectName: 'P', scenes: [scene] })
    expect(xml).toContain('<asset-clip name="INT. PUB &lt;NIGHT&gt; &amp; FOG"')
    expect(xml).toContain('name="INT. PUB &lt;NIGHT&gt; &amp; FOG — Take 1"')
  })

  it('summarizes total scenes considered as the input length', () => {
    const scenes = [
      makeScene({ sceneId: 'a' }),
      makeScene({ sceneId: 'b', take: { ...makeScene().take, src: '' } }),
      makeScene({ sceneId: 'c' }),
    ]
    const { summary } = composeFcpxml({ projectName: 'P', scenes })
    expect(summary.totalScenesConsidered).toBe(3)
    expect(summary.exportedSceneCount).toBe(2)
    expect(summary.skippedScenes).toHaveLength(1)
  })

  it('produces stable deterministic output for identical input', () => {
    const input: FcpxmlInput = { projectName: 'Det', scenes: [makeScene(), makeScene({ sceneId: 's2', sceneName: 'S2' })] }
    expect(composeFcpxml(input).xml).toBe(composeFcpxml(input).xml)
  })
})
