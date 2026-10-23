"use client";

// Adapted from Cult UI Text Animate (MIT) to keep the heading semantic and readable.
import { useRef, type ElementType, type ReactNode } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type AnimationType = "fadeInUp" | "rollIn";

type TextAnimateProps = {
  text: string;
  as?: "h1" | "h2" | "h3" | "p";
  type?: AnimationType;
  className?: string;
  delay?: number;
  children?: ReactNode;
};

const container = {
  hidden: {},
  visible: (delay: number) => ({
    transition: { staggerChildren: 0.018, delayChildren: delay },
  }),
};

const word = {
  hidden: { opacity: 0, y: "0.4em" },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function TextAnimate({
  text,
  as = "h2",
  type = "rollIn",
  className,
  delay = 0.05,
  children,
}: TextAnimateProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-12% 0px" });
  const reduceMotion = useReducedMotion();
  const Tag = as as ElementType;

  if (reduceMotion || type === "fadeInUp") {
    return (
      <div ref={ref}>
        <Tag className={className}>{children ?? text}</Tag>
      </div>
    );
  }

  const words = text.split(" ");

  return (
    <div ref={ref}>
      <Tag className={cn("text-balance", className)} aria-label={text}>
        <span className="sr-only">{text}</span>
        <motion.span
          aria-hidden="true"
          className="inline"
          custom={delay}
          initial="hidden"
          animate={inView ? "visible" : "hidden"}
          variants={container}
        >
          {words.map((item, index) => (
            <motion.span
              className="mr-[0.22em] inline-block whitespace-nowrap"
              key={`${item}-${index}`}
              variants={word}
            >
              {item}
            </motion.span>
          ))}
        </motion.span>
      </Tag>
    </div>
  );
}
