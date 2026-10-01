import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore, type IcyState, type SpriteAction } from '../../stores/appStore'

type SpriteVariant = IcyState | 'calm' | 'research'

const spriteFor = (state: IcyState, action: SpriteAction): SpriteVariant =>
  action === 'default' ? state : action

const COAT = '#ffffff'
const COAT_EDGE = '#eef4f7'
const SHADE = '#e4ecf1'
const LINE = '#aebec8'
const INK = '#14181c'

/** The dome that makes up head and body — one continuous shape, no visible neck. */
const BODY_PATH =
  'M32 5c11.6 0 18.6 9.2 20.2 21.3 1.4 10.5 1.4 24.5 0 33.5-.5 3.4-1 5.6-1.6 7-.5 1.2-1.2 1.7-2.4 1.7H15.8c-1.2 0-1.9-.5-2.4-1.7-.6-1.4-1.1-3.6-1.6-7-1.4-9-1.4-23 0-33.5C13.4 14.2 20.4 5 32 5Z'

/**
 * Ice Bear, as he appears in We Bare Bears.
 *
 * The read depends on restraint: a tall egg silhouette, two very small ears perched on
 * the crown, two pinhead dot eyes, and a small oval nose. There is no mouth curve big
 * enough to read as a smile — just a short flat mark, which is what gives the character
 * his permanent unimpressed expression. The right side carries a soft cool shadow so the
 * white coat reads as a rounded volume rather than a flat blob.
 */
const BearShape = ({ variant }: { variant: SpriteVariant }) => (
  <svg viewBox="0 0 64 70" preserveAspectRatio="xMidYMid meet" aria-hidden="true" className="h-full w-full">
    <defs>
      <clipPath id="icy-coat">
        <path d={BODY_PATH} />
      </clipPath>
    </defs>

    {/* Ears: small, and set well in from the edges of the crown. */}
    <circle cx="20" cy="14.5" r="5.4" fill={COAT_EDGE} />
    <circle cx="44" cy="14.5" r="5.4" fill={COAT_EDGE} />
    <circle cx="20" cy="14.5" r="2.4" fill={SHADE} />
    <circle cx="44" cy="14.5" r="2.4" fill={SHADE} />

    <path d={BODY_PATH} fill={COAT} stroke={LINE} strokeWidth="1.2" />

    {/* Cool shading down the right flank, clipped so it follows the silhouette. */}
    <g clipPath="url(#icy-coat)">
      <path d="M46 0h18v70H46Z" fill={SHADE} opacity="0.85" />
      <ellipse cx="20" cy="62" rx="15" ry="7" fill={SHADE} opacity="0.35" />
    </g>

    {/* Eyes: two small black dots, close together, sitting low on the dome. */}
    <circle cx="28.2" cy="29.6" r="2.15" fill={INK} />
    <circle cx="35.8" cy="29.6" r="2.15" fill={INK} />

    {/* Nose: a small rounded oval, wider than it is tall. */}
    <rect x="28.4" y="34.4" width="7.2" height="4.8" rx="2.4" fill={INK} />

    {/* Mouth: one short, almost flat line. No upward turn, on purpose. */}
    <path d="M29.6 42.6c1.4-.7 3.4-.7 4.8 0" fill="none" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />

    {/* The long arm contour sweeping down the right side. */}
    <path
      d="M40.8 36.5c4.2 5.2 6.6 10.8 6.6 15.6 0 3.4-1.4 5.9-3.9 7.4"
      fill="none"
      stroke={LINE}
      strokeWidth="1.6"
      strokeLinecap="round"
    />

    {/* Two short vertical marks at the base, hinting at the body underneath. */}
    <path d="M24.5 58.5v8" fill="none" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />
    <path d="M33.5 58.5v8" fill="none" stroke={LINE} strokeWidth="1.6" strokeLinecap="round" />

    {variant === 'working' && (
      <g className="sprite-idea">
        <circle cx="52" cy="20" r="3.6" fill="#f6d576" />
        <circle cx="50.9" cy="18.9" r="1.2" fill="#fff8e2" />
      </g>
    )}
    {variant === 'chatting' && (
      <g className="sprite-talk">
        <rect x="46" y="27" width="13" height="9" rx="3" fill="#a9dbdf" stroke={LINE} strokeWidth="0.8" />
        <path d="M50 36v3.4l3.6-3.4Z" fill="#a9dbdf" />
      </g>
    )}
    {variant === 'calm' && (
      <g className="sprite-sleep" fill="#9fbdd0" fontFamily="monospace">
        <text x="47" y="22" fontSize="7">z</text>
        <text x="53" y="15" fontSize="5">z</text>
      </g>
    )}
    {variant === 'research' && (
      <g className="sprite-read">
        <rect x="45" y="22" width="12" height="14" rx="2" fill={COAT_EDGE} stroke={LINE} strokeWidth="0.9" />
        <rect x="47" y="25" width="8" height="8" rx="1" fill="#a9dbdf" />
      </g>
    )}
  </svg>
)
export const IcySprite = () => {
  const icyState = useAppStore((state) => state.icyState)
  const spriteAction = useAppStore((state) => state.spriteAction)
  const variant = spriteFor(icyState, spriteAction)
  // The authored artwork is the source of truth; the inline SVG is only a stand-in
  // for when that file has not been dropped into public/ yet.
  const [imageFailed, setImageFailed] = useState(false)

  return (
    // Ice Bear is taller than he is wide, so the box is portrait rather than square.
    <div className="relative h-11 w-10 shrink-0" aria-label={`Icy Bear ${variant}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={variant}
          className="absolute inset-0"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1, y: variant === 'idle' ? [0, -1.5, 0] : 0 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{
            opacity: { duration: 0.25, ease: 'easeInOut' },
            scale: { duration: 0.25, ease: 'easeInOut' },
            y: { duration: 3.4, repeat: Infinity, ease: 'easeInOut' }
          }}
        >
          <MascotArt variant={variant} imageFailed={imageFailed} onImageError={() => setImageFailed(true)} />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/**
 * The authored artwork, resolved from the renderer's `public/` folder.
 *
 * It has to be resolved against the document rather than written as `/icy.png`: the
 * packaged app loads the renderer over `file://`, where a leading slash means the root of
 * the drive and the sprite silently 404s into the SVG stand-in.
 */
const MASCOT_PNG = new URL('icy.png', document.baseURI).href

/**
 * The author's Ice Bear, cut out of the green screen he was screenshotted against.
 *
 * The source frame is wide and cropped flat along the bottom, so the box is fitted by
 * width and the leftover height is shared top and bottom — never `cover`, which would
 * crop the ears off the one part of him that has to survive at 40px.
 */
const MascotArt = ({
  variant,
  imageFailed,
  onImageError
}: {
  variant: SpriteVariant
  imageFailed: boolean
  onImageError: () => void
}) => {
  if (!imageFailed) {
    return (
      <>
        <img className="mascot-art" src={MASCOT_PNG} alt="" aria-hidden="true" draggable={false} onError={onImageError} />
        <SpriteBadge variant={variant} />
      </>
    )
  }
  return <BearShape variant={variant} />
}

/** Where a variant's badge sits: clear of the ears, in the top corner of the box. */
const BADGE_CLASS = 'pointer-events-none absolute -right-1 -top-1 h-4 w-4'

/**
 * The per-state glyphs the hand-drawn sprite used to carry in its own artwork. Now that
 * the real picture is a photograph of one fixed pose, they ride on top of it instead, so
 * a working or sleeping Icy still reads as working or sleeping at a glance.
 */
const SpriteBadge = ({ variant }: { variant: SpriteVariant }) => {
  switch (variant) {
    case 'working':
      return (
        <svg viewBox="0 0 16 16" className={BADGE_CLASS} aria-hidden="true">
          <circle cx="8" cy="8" r="5.6" fill="#f6d576" stroke={INK} strokeWidth="0.9" />
          <circle cx="6.3" cy="6.3" r="1.7" fill="#fff8e2" />
        </svg>
      )
    case 'chatting':
      return (
        <svg viewBox="0 0 16 16" className={BADGE_CLASS} aria-hidden="true">
          <rect x="1.4" y="2.4" width="13.2" height="8.8" rx="3.4" fill="#a9dbdf" stroke={INK} strokeWidth="0.9" />
          <path d="M5 11.2v3.2l3.6-3.2Z" fill="#a9dbdf" stroke={INK} strokeWidth="0.9" strokeLinejoin="round" />
        </svg>
      )
    case 'calm':
      return (
        <svg viewBox="0 0 16 16" className={BADGE_CLASS} aria-hidden="true">
          <text x="2.5" y="9.5" fontSize="8.5" fontWeight="700" fill="#cfe3ee" fontFamily="monospace">z</text>
          <text x="8.5" y="15" fontSize="6" fontWeight="700" fill="#cfe3ee" fontFamily="monospace">z</text>
        </svg>
      )
    case 'research':
      return (
        <svg viewBox="0 0 16 16" className={BADGE_CLASS} aria-hidden="true">
          <rect x="2.4" y="1.4" width="11.2" height="13.2" rx="2" fill={COAT_EDGE} stroke={INK} strokeWidth="0.9" />
          <rect x="4.6" y="4.2" width="6.8" height="7.6" rx="1" fill="#a9dbdf" />
        </svg>
      )
    default:
      return null
  }
}
