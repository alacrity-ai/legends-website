import type { ReactNode } from 'react';
import styles from './Heading.module.css';

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4';

type HeadingProps = {
  level?: HeadingLevel;
  children: ReactNode;
  subtitle?: string;
  align?: 'left' | 'center';
  className?: string;
};

export default function Heading({
  level = 'h2',
  children,
  subtitle,
  align = 'left',
  className,
}: HeadingProps) {
  const Tag = level;
  const classes = [styles.heading, align === 'center' && styles.center, className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <Tag className={styles.title}>{children}</Tag>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}

