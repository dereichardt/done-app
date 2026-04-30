"use client";

import { useState } from "react";
import { IntegrationDeliveryProgressTrack } from "./integration-delivery-progress-track";
import { IntegrationUpdatesPanel, type IntegrationUpdateRow } from "./integration-updates-panel";

export type DeliveryProgressTransitionRow = {
  id: string;
  from_delivery_progress: string;
  to_delivery_progress: string;
  created_at: string;
};

type IntegrationStatusAndProgressSectionProps = {
  projectIntegrationId: string;
  deliveryProgress: string;
  integrationState: string;
  integrationStateReason: string | null;
  deliveryProgressTransitions: DeliveryProgressTransitionRow[];
  projectLabel: string;
  integrationDisplayTitle: string;
  updates: IntegrationUpdateRow[];
};

export function IntegrationStatusAndProgressSection({
  projectIntegrationId,
  deliveryProgress,
  integrationState,
  integrationStateReason,
  deliveryProgressTransitions,
  projectLabel,
  integrationDisplayTitle,
  updates,
}: IntegrationStatusAndProgressSectionProps) {
  const [delivery, setDelivery] = useState(deliveryProgress);

  return (
    <>
      <IntegrationDeliveryProgressTrack
        projectIntegrationId={projectIntegrationId}
        integrationState={integrationState}
        integrationStateReason={integrationStateReason}
        value={delivery}
        transitions={deliveryProgressTransitions}
        onChange={setDelivery}
      />

      <section className="mt-10">
        <div className="flex flex-col gap-2">
          <h2 className="section-heading">Updates</h2>
          <div className="h-[21rem] max-h-[85vh] min-h-0 shrink-0">
            <IntegrationUpdatesPanel
              className="h-full min-h-0"
              projectIntegrationId={projectIntegrationId}
              projectLabel={projectLabel}
              integrationDisplayTitle={integrationDisplayTitle}
              updates={updates}
            />
          </div>
        </div>
      </section>
    </>
  );
}
