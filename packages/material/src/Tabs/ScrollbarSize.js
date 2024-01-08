import debounce from "../utils/debounce";
import { ownerWindow } from "../utils";
import createEffectWithCleaning from "@suid/system/createEffectWithCleaning";
import { createEffect, on, splitProps } from "solid-js";

const styles = {
  width: 99,
  height: 99,
  position: "absolute",
  top: -9999,
  overflow: "scroll",
};

/**
 * @ignore - internal component.
 * The component originates from https://github.com/STORIS/react-scrollbar-size.
 * It has been moved into the core in order to minimize the bundle size.
 */
export default function ScrollbarSize(props) {
  const [, other] = splitProps(props, ["onChange"]);
  const scrollbarHeight = React.useRef();
  const nodeRef = React.useRef(null);

  const setMeasurements = () => {
    scrollbarHeight.current =
      nodeRef.current.offsetHeight - nodeRef.current.clientHeight;
  };

  createEffectWithCleaning(
    on(
      () => [props.onChange],
      () => {
        const handleResize = debounce(() => {
          const prevHeight = scrollbarHeight.current;
          setMeasurements();

          if (prevHeight !== scrollbarHeight.current) {
            props.onChange(scrollbarHeight.current);
          }
        });

        const containerWindow = ownerWindow(nodeRef.current);
        containerWindow.addEventListener("resize", handleResize);
        return () => {
          handleResize.clear();
          containerWindow.removeEventListener("resize", handleResize);
        };
      },
    ),
  );

  createEffect(
    on(
      () => [props.onChange],
      () => {
        setMeasurements();
        props.onChange(scrollbarHeight.current);
      },
    ),
  );

  return <div style={styles} ref={nodeRef} {...other} />;
}
