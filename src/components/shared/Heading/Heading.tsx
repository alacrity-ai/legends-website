import type { ReactNode } from 'react';
import styles from './Heading.module.css';

type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4';

type HeadingProps = {
  level?: HeadingLevel;
  children: ReactNode;
  subtitle?: string;
  className?: string;
};

export default function Heading({
  level = 'h2',
  children,
  subtitle,
  className,
}: HeadingProps) {
  const Tag = level;

  return (
    <div className={`${styles.heading}${className ? ` ${className}` : ''}`}>
      <Tag className={styles.title}>{children}</Tag>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </div>
  );
}

