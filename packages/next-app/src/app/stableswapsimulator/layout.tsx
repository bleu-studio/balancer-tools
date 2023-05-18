"use client";

import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import * as Separator from "@radix-ui/react-separator";
import * as React from "react";

import balancerSymbol from "#/assets/balancer-symbol.svg";
import { Dialog } from "#/components/Dialog";
import { Header } from "#/components/Header";
import Sidebar from "#/components/Sidebar";

import PoolParameterForm from "./(components)/PoolParametersForm";

export default function Layout({children}: React.PropsWithChildren) {
  return (
      <div className="flex flex-col h-full">
        <Header
          linkUrl={"/stableswapsimulator"}
          title={"Stable Swap Simulator"}
          imageSrc={balancerSymbol}
          wallet={false}
        />
        <div className="flex flex-1 gap-x-8">
          <div>
            <Sidebar isFloating>
              {/* TODO: BAL-384 */}
              <Dialog title="Go  to pool" content={<></>}>
                <span className="text-sm font-normal text-slate12 cursor-pointer flex items-center space-x-2">
                  <MagnifyingGlassIcon width="16" height="16" strokeWidth={1} />
                  <span>Import pool parameters</span>
                </span>
              </Dialog>
              <Separator.Root className="bg-blue6 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px my-5" />
                <Sidebar.Header name="Initial parameters" />
              <Sidebar.Content>
                  <PoolParameterForm />
              </Sidebar.Content>
            </Sidebar>  
          </div>
          {children}
        </div>
      </div>
  );
}
