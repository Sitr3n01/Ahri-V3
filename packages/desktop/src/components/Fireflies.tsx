/**
 * Fireflies — V2-style floating particles for VN ambiance.
 * Uses persona colors via CSS variables (--persona-primary, --persona-glow).
 * Each particle has a unique position, duration, and delay for organic movement.
 */

interface FireflyConfig {
  top: string;
  left: string;
  dur: string;
  delay: string;
}

const FIREFLY_CONFIGS: FireflyConfig[] = [
  { top: '15%', left: '10%',  dur: '7s',  delay: '0s'   },
  { top: '45%', left: '85%',  dur: '9s',  delay: '1.5s' },
  { top: '70%', left: '25%',  dur: '11s', delay: '0.8s' },
  { top: '25%', left: '60%',  dur: '8s',  delay: '2.2s' },
  { top: '80%', left: '70%',  dur: '10s', delay: '0.3s' },
  { top: '55%', left: '40%',  dur: '12s', delay: '1.8s' },
  { top: '35%', left: '90%',  dur: '6s',  delay: '3.0s' },
];

interface FirefliesProps {
  particleCount?: number;
}

export function Fireflies({ particleCount = 7 }: FirefliesProps) {
  const configs = FIREFLY_CONFIGS.slice(0, particleCount);

  return (
    <>
      {configs.map((cfg, i) => (
        <div
          key={i}
          className="vn-firefly"
          style={{
            top: cfg.top,
            left: cfg.left,
            '--ff-dur': cfg.dur,
            '--ff-delay': cfg.delay,
          } as React.CSSProperties}
        />
      ))}
    </>
  );
}
