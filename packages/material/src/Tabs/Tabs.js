import { isFragment } from "react-is";
import clsx from "clsx";
import styled from "../styles/styled";
import useThemeProps from "../styles/useThemeProps";
import useTheme from "../styles/useTheme";
import debounce from "../utils/debounce";
import { getNormalizedScrollLeft, detectScrollType } from "../utils/scrollLeft";
import animate from "../internal/animate";
import ScrollbarSize from "./ScrollbarSize";
import TabScrollButton from "../TabScrollButton";
import useEventCallback from "../utils/useEventCallback";
import { getTabsUtilityClass } from "./tabsClasses";
import tabsClasses from "./tabsClasses";
import ownerDocument from "../utils/ownerDocument";
import ownerWindow from "../utils/ownerWindow";
import createRef from "@suid/system/createRef";
import {
  createSignal,
  createMemo,
  onMount,
  createEffect,
  on,
  splitProps,
  mergeProps,
} from "solid-js";
import createEffectWithCleaning from "@suid/system/createEffectWithCleaning";
import composeClasses from "@suid/base/unstable_composeClasses";

const nextItem = (list, item) => {
  if (list === item) {
    return list.firstChild;
  }
  if (item && item.nextElementSibling) {
    return item.nextElementSibling;
  }
  return list.firstChild;
};

const previousItem = (list, item) => {
  if (list === item) {
    return list.lastChild;
  }
  if (item && item.previousElementSibling) {
    return item.previousElementSibling;
  }
  return list.lastChild;
};

const moveFocus = (list, currentFocus, traversalFunction) => {
  let wrappedOnce = false;
  let nextFocus = traversalFunction(list, currentFocus);

  while (nextFocus) {
    // Prevent infinite loop.
    if (nextFocus === list.firstChild) {
      if (wrappedOnce) {
        return;
      }
      wrappedOnce = true;
    }

    // Same logic as useAutocomplete.js
    const nextFocusDisabled =
      nextFocus.disabled || nextFocus.getAttribute("aria-disabled") === "true";

    if (!nextFocus.hasAttribute("tabindex") || nextFocusDisabled) {
      // Move to the next element.
      nextFocus = traversalFunction(list, nextFocus);
    } else {
      nextFocus.focus();
      return;
    }
  }
};

const useUtilityClasses = (ownerState) => {
  const {
    vertical,
    fixed,
    hideScrollbar,
    scrollableX,
    scrollableY,
    centered,
    scrollButtonsHideMobile,
    classes,
  } = ownerState;

  const slots = {
    root: ["root", vertical && "vertical"],
    scroller: [
      "scroller",
      fixed && "fixed",
      hideScrollbar && "hideScrollbar",
      scrollableX && "scrollableX",
      scrollableY && "scrollableY",
    ],
    flexContainer: [
      "flexContainer",
      vertical && "flexContainerVertical",
      centered && "centered",
    ],
    indicator: ["indicator"],
    scrollButtons: [
      "scrollButtons",
      scrollButtonsHideMobile && "scrollButtonsHideMobile",
    ],
    scrollableX: [scrollableX && "scrollableX"],
    hideScrollbar: [hideScrollbar && "hideScrollbar"],
  };

  return composeClasses(slots, getTabsUtilityClass, classes);
};

const TabsRoot = styled("div", {
  name: "MuiTabs",
  slot: "Root",
  overridesResolver: (props, styles) => {
    const { ownerState } = props;

    return [
      { [`& .${tabsClasses.scrollButtons}`]: styles.scrollButtons },
      {
        [`& .${tabsClasses.scrollButtons}`]:
          ownerState.scrollButtonsHideMobile && styles.scrollButtonsHideMobile,
      },
      styles.root,
      ownerState.vertical && styles.vertical,
    ];
  },
})(({ ownerState, theme }) => ({
  overflow: "hidden",
  minHeight: 48,
  // Add iOS momentum scrolling for iOS < 13.0
  WebkitOverflowScrolling: "touch",
  display: "flex",
  ...(ownerState.vertical && {
    flexDirection: "column",
  }),
  ...(ownerState.scrollButtonsHideMobile && {
    [`& .${tabsClasses.scrollButtons}`]: {
      [theme.breakpoints.down("sm")]: {
        display: "none",
      },
    },
  }),
}));

const TabsScroller = styled("div", {
  name: "MuiTabs",
  slot: "Scroller",
  overridesResolver: (props, styles) => {
    const { ownerState } = props;
    return [
      styles.scroller,
      ownerState.fixed && styles.fixed,
      ownerState.hideScrollbar && styles.hideScrollbar,
      ownerState.scrollableX && styles.scrollableX,
      ownerState.scrollableY && styles.scrollableY,
    ];
  },
})(({ ownerState }) => ({
  position: "relative",
  display: "inline-block",
  flex: "1 1 auto",
  whiteSpace: "nowrap",
  ...(ownerState.fixed && {
    overflowX: "hidden",
    width: "100%",
  }),
  ...(ownerState.hideScrollbar && {
    // Hide dimensionless scrollbar on MacOS
    scrollbarWidth: "none", // Firefox
    "&::-webkit-scrollbar": {
      display: "none", // Safari + Chrome
    },
  }),
  ...(ownerState.scrollableX && {
    overflowX: "auto",
    overflowY: "hidden",
  }),
  ...(ownerState.scrollableY && {
    overflowY: "auto",
    overflowX: "hidden",
  }),
}));

const FlexContainer = styled("div", {
  name: "MuiTabs",
  slot: "FlexContainer",
  overridesResolver: (props, styles) => {
    const { ownerState } = props;
    return [
      styles.flexContainer,
      ownerState.vertical && styles.flexContainerVertical,
      ownerState.centered && styles.centered,
    ];
  },
})(({ ownerState }) => ({
  display: "flex",
  ...(ownerState.vertical && {
    flexDirection: "column",
  }),
  ...(ownerState.centered && {
    justifyContent: "center",
  }),
}));

const TabsIndicator = styled("span", {
  name: "MuiTabs",
  slot: "Indicator",
  overridesResolver: (props, styles) => styles.indicator,
})(({ ownerState, theme }) => ({
  position: "absolute",
  height: 2,
  bottom: 0,
  width: "100%",
  transition: theme.transitions.create(),
  ...(ownerState.indicatorColor === "primary" && {
    backgroundColor: theme.palette.primary.main,
  }),
  ...(ownerState.indicatorColor === "secondary" && {
    backgroundColor: theme.palette.secondary.main,
  }),
  ...(ownerState.vertical && {
    height: "100%",
    width: 2,
    right: 0,
  }),
}));

const TabsScrollbarSize = styled(ScrollbarSize, {
  name: "MuiTabs",
  slot: "ScrollbarSize",
})({
  overflowX: "auto",
  overflowY: "hidden",
  // Hide dimensionless scrollbar on MacOS
  scrollbarWidth: "none", // Firefox
  "&::-webkit-scrollbar": {
    display: "none", // Safari + Chrome
  },
});

const defaultIndicatorStyle = {};

let warnedOnceTabPresent = false;

const Tabs = function Tabs(inProps) {
  const ref = createRef(inProps);
  const props = useThemeProps({
    props: inProps,
    name: "MuiTabs",
  });
  const theme = useTheme();
  const isRtl = theme.direction === "rtl";
  const [, other] = splitProps(props, [
    "'aria-label'",
    "'aria-labelledby'",
    "action",
    "centered",
    "children",
    "className",
    "component",
    "allowScrollButtonsMobile",
    "indicatorColor",
    "onChange",
    "orientation",
    "ScrollButtonComponent",
    "scrollButtons",
    "selectionFollowsFocus",
    "TabIndicatorProps",
    "TabScrollButtonProps",
    "textColor",
    "value",
    "variant",
    "visibleScrollbar",
  ]);

  const baseProps = mergeProps(
    {
      centered: false,
      component: "div",
      allowScrollButtonsMobile: false,
      indicatorColor: "primary",
      orientation: "horizontal",
      ScrollButtonComponent: TabScrollButton,
      scrollButtons: "auto",
      TabIndicatorProps: {},
      TabScrollButtonProps: {},
      textColor: "primary",
      variant: "standard",
      visibleScrollbar: false,
    },
    props,
  );

  const scrollable = baseProps.variant === "scrollable";
  const vertical = baseProps.orientation === "vertical";

  const scrollStart = vertical ? "scrollTop" : "scrollLeft";
  const start = vertical ? "top" : "left";
  const end = vertical ? "bottom" : "right";
  const clientSize = vertical ? "clientHeight" : "clientWidth";
  const size = vertical ? "height" : "width";

  const ownerState = mergeProps(props, {
    get component() {
      return baseProps.component;
    },
    get allowScrollButtonsMobile() {
      return baseProps.allowScrollButtonsMobile;
    },
    get indicatorColor() {
      return baseProps.indicatorColor;
    },
    get orientation() {
      return baseProps.orientation;
    },
    vertical: vertical,
    get scrollButtons() {
      return baseProps.scrollButtons;
    },
    get textColor() {
      return baseProps.textColor;
    },
    get variant() {
      return baseProps.variant;
    },
    get visibleScrollbar() {
      return baseProps.visibleScrollbar;
    },
    get fixed() {
      return !scrollable;
    },
    get hideScrollbar() {
      return scrollable && !baseProps.visibleScrollbar;
    },
    get scrollableX() {
      return scrollable && !vertical;
    },
    get scrollableY() {
      return scrollable && vertical;
    },
    get centered() {
      return baseProps.centered && !scrollable;
    },
    get scrollButtonsHideMobile() {
      return !baseProps.allowScrollButtonsMobile;
    },
  });

  const classes = useUtilityClasses(ownerState);

  if (process.env.NODE_ENV !== "production") {
    if (baseProps.centered && scrollable) {
      console.error(
        'MUI: You can not use the `centered={true}` and `variant="scrollable"` properties ' +
          "at the same time on a `Tabs` component.",
      );
    }
  }

  const [mounted, setMounted] = createSignal(false);
  const [indicatorStyle, setIndicatorStyle] = createSignal(
    defaultIndicatorStyle,
  );
  const [displayScroll, setDisplayScroll] = createSignal({
    start: false,
    end: false,
  });

  const [scrollerStyle, setScrollerStyle] = createSignal({
    overflow: "hidden",
    scrollbarWidth: 0,
  });

  const valueToIndex = new Map();
  const tabsRef = React.useRef(null);
  const tabListRef = React.useRef(null);

  const getTabsMeta = () => {
    const tabsNode = tabsRef.current;
    let tabsMeta;
    if (tabsNode) {
      const rect = tabsNode.getBoundingClientRect();
      // create a new object with ClientRect class props + scrollLeft
      tabsMeta = {
        clientWidth: tabsNode.clientWidth,
        scrollLeft: tabsNode.scrollLeft,
        scrollTop: tabsNode.scrollTop,
        scrollLeftNormalized: getNormalizedScrollLeft(
          tabsNode,
          theme.direction,
        ),
        scrollWidth: tabsNode.scrollWidth,
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
      };
    }

    let tabMeta;
    if (tabsNode && props.value !== false) {
      const children = tabListRef.current.children;

      if (children.length > 0) {
        const tab = children[valueToIndex.get(props.value)];
        if (process.env.NODE_ENV !== "production") {
          if (!tab) {
            console.error(
              [
                `MUI: The \`value\` provided to the Tabs component is invalid.`,
                `None of the Tabs' children match with "${props.value}".`,
                valueToIndex.keys
                  ? `You can provide one of the following values: ${Array.from(
                      valueToIndex.keys(),
                    ).join(", ")}.`
                  : null,
              ].join("\n"),
            );
          }
        }
        tabMeta = tab ? tab.getBoundingClientRect() : null;

        if (process.env.NODE_ENV !== "production") {
          if (
            process.env.NODE_ENV !== "test" &&
            !warnedOnceTabPresent &&
            tabMeta &&
            tabMeta.width === 0 &&
            tabMeta.height === 0
          ) {
            tabsMeta = null;
            console.error(
              [
                "MUI: The `value` provided to the Tabs component is invalid.",
                `The Tab with this \`value\` ("${props.value}") is not part of the document layout.`,
                "Make sure the tab item is present in the document or that it's not `display: none`.",
              ].join("\n"),
            );

            warnedOnceTabPresent = true;
          }
        }
      }
    }
    return { tabsMeta, tabMeta };
  };

  const updateIndicatorState = useEventCallback(() => {
    const { tabsMeta, tabMeta } = getTabsMeta();
    let startValue = 0;
    let startIndicator;

    if (vertical) {
      startIndicator = "top";
      if (tabMeta && tabsMeta) {
        startValue = tabMeta.top - tabsMeta.top + tabsMeta.scrollTop;
      }
    } else {
      startIndicator = isRtl ? "right" : "left";
      if (tabMeta && tabsMeta) {
        const correction = isRtl
          ? tabsMeta.scrollLeftNormalized +
            tabsMeta.clientWidth -
            tabsMeta.scrollWidth
          : tabsMeta.scrollLeft;
        startValue =
          (isRtl ? -1 : 1) *
          (tabMeta[startIndicator] - tabsMeta[startIndicator] + correction);
      }
    }

    const newIndicatorStyle = {
      [startIndicator]: startValue,
      // May be wrong until the font is loaded.
      [size]: tabMeta ? tabMeta[size] : 0,
    };

    // IE11 support, replace with Number.isNaN
    // eslint-disable-next-line no-restricted-globals
    if (
      isNaN(indicatorStyle()[startIndicator]) ||
      isNaN(indicatorStyle()[size])
    ) {
      setIndicatorStyle(newIndicatorStyle);
    } else {
      const dStart = Math.abs(
        indicatorStyle()[startIndicator] - newIndicatorStyle[startIndicator],
      );
      const dSize = Math.abs(indicatorStyle()[size] - newIndicatorStyle[size]);

      if (dStart >= 1 || dSize >= 1) {
        setIndicatorStyle(newIndicatorStyle);
      }
    }
  });

  const scroll = (scrollValue, { animation = true } = {}) => {
    if (animation) {
      animate(scrollStart, tabsRef.current, scrollValue, {
        duration: theme.transitions.duration.standard,
      });
    } else {
      tabsRef.current[scrollStart] = scrollValue;
    }
  };

  const moveTabsScroll = (delta) => {
    let scrollValue = tabsRef.current[scrollStart];

    if (vertical) {
      scrollValue += delta;
    } else {
      scrollValue += delta * (isRtl ? -1 : 1);
      // Fix for Edge
      scrollValue *= isRtl && detectScrollType() === "reverse" ? -1 : 1;
    }

    scroll(scrollValue);
  };

  const getScrollSize = () => {
    const containerSize = tabsRef.current[clientSize];
    let totalSize = 0;
    const children = Array.from(tabListRef.current.children);

    for (let i = 0; i < children.length; i += 1) {
      const tab = children[i];
      if (totalSize + tab[clientSize] > containerSize) {
        break;
      }
      totalSize += tab[clientSize];
    }
    return totalSize;
  };

  const handleStartScrollClick = () => {
    moveTabsScroll(-1 * getScrollSize());
  };

  const handleEndScrollClick = () => {
    moveTabsScroll(getScrollSize());
  };

  // TODO Remove <ScrollbarSize /> as browser support for hidding the scrollbar
  // with CSS improves.
  const handleScrollbarSizeChange = (scrollbarWidth) => {
    setScrollerStyle({
      overflow: null,
      scrollbarWidth,
    });
  };

  const getConditionalElements = () => {
    const conditionalElements = {};

    conditionalElements.scrollbarSizeListener = scrollable ? (
      <TabsScrollbarSize
        onChange={handleScrollbarSizeChange}
        class={clsx(classes.scrollableX, classes.hideScrollbar)}
      />
    ) : null;

    const scrollButtonsActive = displayScroll().start || displayScroll().end;
    const showScrollButtons =
      scrollable &&
      ((baseProps.scrollButtons === "auto" && scrollButtonsActive) ||
        baseProps.scrollButtons === true);

    conditionalElements.scrollButtonStart = showScrollButtons ? (
      <baseProps.ScrollButtonComponent
        orientation={baseProps.orientation}
        direction={isRtl ? "right" : "left"}
        onClick={handleStartScrollClick}
        disabled={!displayScroll().start}
        {...baseProps.TabScrollButtonProps}
        class={clsx(
          classes.scrollButtons,
          baseProps.TabScrollButtonProps.className,
        )}
      />
    ) : null;

    conditionalElements.scrollButtonEnd = showScrollButtons ? (
      <baseProps.ScrollButtonComponent
        orientation={baseProps.orientation}
        direction={isRtl ? "left" : "right"}
        onClick={handleEndScrollClick}
        disabled={!displayScroll().end}
        {...baseProps.TabScrollButtonProps}
        class={clsx(
          classes.scrollButtons,
          baseProps.TabScrollButtonProps.className,
        )}
      />
    ) : null;

    return conditionalElements;
  };

  const scrollSelectedIntoView = useEventCallback((animation) => {
    const { tabsMeta, tabMeta } = getTabsMeta();

    if (!tabMeta || !tabsMeta) {
      return;
    }

    if (tabMeta[start] < tabsMeta[start]) {
      // left side of button is out of view
      const nextScrollStart =
        tabsMeta[scrollStart] + (tabMeta[start] - tabsMeta[start]);
      scroll(nextScrollStart, { animation });
    } else if (tabMeta[end] > tabsMeta[end]) {
      // right side of button is out of view
      const nextScrollStart =
        tabsMeta[scrollStart] + (tabMeta[end] - tabsMeta[end]);
      scroll(nextScrollStart, { animation });
    }
  });

  const updateScrollButtonState = useEventCallback(() => {
    if (scrollable && baseProps.scrollButtons !== false) {
      const {
        scrollTop,
        scrollHeight,
        clientHeight,
        scrollWidth,
        clientWidth,
      } = tabsRef.current;
      let showStartScroll;
      let showEndScroll;

      if (vertical) {
        showStartScroll = scrollTop > 1;
        showEndScroll = scrollTop < scrollHeight - clientHeight - 1;
      } else {
        const scrollLeft = getNormalizedScrollLeft(
          tabsRef.current,
          theme.direction,
        );
        // use 1 for the potential rounding error with browser zooms.
        showStartScroll = isRtl
          ? scrollLeft < scrollWidth - clientWidth - 1
          : scrollLeft > 1;
        showEndScroll = !isRtl
          ? scrollLeft < scrollWidth - clientWidth - 1
          : scrollLeft > 1;
      }

      if (
        showStartScroll !== displayScroll().start ||
        showEndScroll !== displayScroll().end
      ) {
        setDisplayScroll({ start: showStartScroll, end: showEndScroll });
      }
    }
  });

  createEffectWithCleaning(
    on(
      () => [updateIndicatorState, updateScrollButtonState],
      () => {
        const handleResize = debounce(() => {
          updateIndicatorState();
          updateScrollButtonState();
        });
        const win = ownerWindow(tabsRef.current);
        win.addEventListener("resize", handleResize);

        let resizeObserver;

        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(handleResize);
          Array.from(tabListRef.current.children).forEach((child) => {
            resizeObserver.observe(child);
          });
        }

        return () => {
          handleResize.clear();
          win.removeEventListener("resize", handleResize);
          if (resizeObserver) {
            resizeObserver.disconnect();
          }
        };
      },
    ),
  );

  const handleTabsScroll = createMemo(() =>
    debounce(() => {
      updateScrollButtonState();
    }),
  );

  createEffectWithCleaning(
    on(
      () => [handleTabsScroll()],
      () => {
        return () => {
          handleTabsScroll().clear();
        };
      },
    ),
  );

  onMount(() => {
    setMounted(true);
  });

  createEffect(() => {
    updateIndicatorState();
    updateScrollButtonState();
  });

  createEffect(
    on(
      () => [scrollSelectedIntoView, indicatorStyle()],
      () => {
        // Don't animate on the first render.
        scrollSelectedIntoView(defaultIndicatorStyle !== indicatorStyle());
      },
    ),
  );

  React.useImperativeHandle(
    props.action,
    () => ({
      updateIndicator: updateIndicatorState,
      updateScrollButtons: updateScrollButtonState,
    }),
    [updateIndicatorState, updateScrollButtonState],
  );

  const indicator = (
    <TabsIndicator
      {...baseProps.TabIndicatorProps}
      class={clsx(classes.indicator, baseProps.TabIndicatorProps.className)}
      ownerState={ownerState}
      style={mergeProps(
        () => indicatorStyle(),
        () => baseProps.TabIndicatorProps.style,
      )}
    />
  );

  let childIndex = 0;
  const children = React.Children.map(props.children, (child) => {
    if (!React.isValidElement(child)) {
      return null;
    }

    if (process.env.NODE_ENV !== "production") {
      if (isFragment(child)) {
        console.error(
          [
            "MUI: The Tabs component doesn't accept a Fragment as a child.",
            "Consider providing an array instead.",
          ].join("\n"),
        );
      }
    }

    const childValue =
      child.props.value === undefined ? childIndex : child.props.value;
    valueToIndex.set(childValue, childIndex);
    const selected = childValue === props.value;

    childIndex += 1;
    return React.cloneElement(child, {
      fullWidth: baseProps.variant === "fullWidth",
      indicator: selected && !mounted() && indicator,
      selected,
      selectionFollowsFocus: props.selectionFollowsFocus,
      onChange: props.onChange,
      textColor: baseProps.textColor,
      value: childValue,
      ...(childIndex === 1 && props.value === false && !child.props.tabIndex
        ? { tabIndex: 0 }
        : {}),
    });
  });

  const handleKeyDown = (event) => {
    const list = tabListRef.current;
    const currentFocus = ownerDocument(list).activeElement;
    // Keyboard navigation assumes that [role="tab"] are siblings
    // though we might warn in the future about nested, interactive elements
    // as a a11y violation
    const role = currentFocus.getAttribute("role");
    if (role !== "tab") {
      return;
    }

    let previousItemKey =
      baseProps.orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    let nextItemKey =
      baseProps.orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    if (baseProps.orientation === "horizontal" && isRtl) {
      // swap previousItemKey with nextItemKey
      previousItemKey = "ArrowRight";
      nextItemKey = "ArrowLeft";
    }

    switch (event.key) {
      case previousItemKey:
        event.preventDefault();
        moveFocus(list, currentFocus, previousItem);
        break;
      case nextItemKey:
        event.preventDefault();
        moveFocus(list, currentFocus, nextItem);
        break;
      case "Home":
        event.preventDefault();
        moveFocus(list, null, nextItem);
        break;
      case "End":
        event.preventDefault();
        moveFocus(list, null, previousItem);
        break;
      default:
        break;
    }
  };

  const conditionalElements = getConditionalElements();

  return (
    <TabsRoot
      class={clsx(classes.root, props.className)}
      ownerState={ownerState}
      ref={ref}
      as={baseProps.component}
      {...other}
    >
      {conditionalElements.scrollButtonStart}
      {conditionalElements.scrollbarSizeListener}
      <TabsScroller
        class={classes.scroller}
        ownerState={ownerState}
        style={{
          get overflow() {
            return scrollerStyle().overflow;
          },
          get [vertical
            ? `margin${isRtl ? "Left" : "Right"}`
            : "marginBottom"]() {
            return baseProps.visibleScrollbar
              ? undefined
              : -scrollerStyle().scrollbarWidth;
          },
        }}
        ref={tabsRef}
        onScroll={handleTabsScroll()}
      >
        {/* The tablist isn't interactive but the tabs are */}
        <FlexContainer
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          aria-orientation={
            baseProps.orientation === "vertical" ? "vertical" : null
          }
          class={classes.flexContainer}
          ownerState={ownerState}
          onKeyDown={handleKeyDown}
          ref={tabListRef}
          role="tablist"
        >
          {children}
        </FlexContainer>
        {mounted() && indicator}
      </TabsScroller>
      {conditionalElements.scrollButtonEnd}
    </TabsRoot>
  );
};
export default Tabs;
