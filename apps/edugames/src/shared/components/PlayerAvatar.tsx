import React from "react";

/** The server assigns each quiz player a colour; draw it instead of printing the hex code. */
export const PlayerAvatar: React.FC<{ avatar?: string | null; size?: number }> = ({
  avatar,
  size = 40,
}) => {
  const isColour = !!avatar && avatar.startsWith("#");
  return (
    <span
      className="inline-flex items-center justify-center rounded-full border-2 border-white/40"
      style={{ width: size, height: size, background: isColour ? avatar! : "rgba(255,255,255,0.2)" }}
    >
      {!isColour && avatar}
    </span>
  );
};
